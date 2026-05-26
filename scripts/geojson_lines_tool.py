import argparse
import json
import os
import time
from json import JSONDecoder

READ_CHUNK_SIZE = 1024 * 64
BUFFER_TRIM_SIZE = 1024 * 1024


def iter_features(path):
	decoder = JSONDecoder()
	with open(path, "r", encoding="utf-8") as handle:
		buffer = ""
		in_features = False
		while True:
			chunk = handle.read(READ_CHUNK_SIZE)
			if not chunk:
				break
			buffer += chunk

			if not in_features:
				features_index = buffer.find('"features"')
				if features_index == -1:
					if len(buffer) > BUFFER_TRIM_SIZE:
						buffer = buffer[-BUFFER_TRIM_SIZE:]
					continue
				array_index = buffer.find("[", features_index)
				if array_index == -1:
					buffer = buffer[features_index:]
					continue
				buffer = buffer[array_index + 1 :]
				in_features = True

			if not in_features:
				continue

			while True:
				buffer = buffer.lstrip()
				if not buffer:
					break
				if buffer[0] == "]":
					return
				try:
					item, end = decoder.raw_decode(buffer)
				except json.JSONDecodeError:
					break
				yield item
				buffer = buffer[end:]
				buffer = buffer.lstrip()
				if buffer.startswith(","):
					buffer = buffer[1:]



def iter_coords(geometry):
	if not geometry:
		return
	geom_type = geometry.get("type")
	coords = geometry.get("coordinates")
	if not geom_type or coords is None:
		return

	if geom_type == "LineString":
		for coord in coords:
			yield coord
		return

	if geom_type == "MultiLineString":
		for line in coords:
			for coord in line:
				yield coord
		return

	if geom_type == "GeometryCollection":
		for geom in geometry.get("geometries", []):
			yield from iter_coords(geom)



def merge_bbox(current, coord):
	if coord is None or len(coord) < 2:
		return current
	lng, lat = coord[0], coord[1]
	if current is None:
		return [lng, lat, lng, lat]
	current[0] = min(current[0], lng)
	current[1] = min(current[1], lat)
	current[2] = max(current[2], lng)
	current[3] = max(current[3], lat)
	return current


def feature_bbox(feature):
	bbox = None
	for coord in iter_coords(feature.get("geometry")):
		bbox = merge_bbox(bbox, coord)
	return bbox


def write_chunk(output_dir, chunk_index, features):
	file_name = f"lines-region-{chunk_index:03d}.geojson"
	path = os.path.join(output_dir, file_name)
	payload = {"type": "FeatureCollection", "features": features}
	with open(path, "w", encoding="utf-8") as handle:
		json.dump(payload, handle, separators=(",", ":"))
	return file_name, os.path.getsize(path)


def split_geojson(input_path, output_dir, target_bytes):
	os.makedirs(output_dir, exist_ok=True)
	chunks = []
	chunk_features = []
	chunk_size = 0
	chunk_index = 1
	chunk_bbox = None

	for feature in iter_features(input_path):
		feature_json = json.dumps(feature, separators=(",", ":"))
		feature_bytes = len(feature_json) + 1

		if chunk_features and chunk_size + feature_bytes > target_bytes:
			file_name, file_size = write_chunk(output_dir, chunk_index, chunk_features)
			chunks.append(
				{
					"file": file_name,
					"bbox": chunk_bbox,
					"features": len(chunk_features),
					"bytes": file_size,
				}
			)
			chunk_index += 1
			chunk_features = []
			chunk_size = 0
			chunk_bbox = None

		chunk_features.append(feature)
		chunk_size += feature_bytes
		chunk_bbox = merge_bbox(chunk_bbox, feature_bbox(feature))

	if chunk_features:
		file_name, file_size = write_chunk(output_dir, chunk_index, chunk_features)
		chunks.append(
			{
				"file": file_name,
				"bbox": chunk_bbox,
				"features": len(chunk_features),
				"bytes": file_size,
			}
		)

	index = {
		"source": os.path.basename(input_path),
		"generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
		"targetBytes": target_bytes,
		"chunks": chunks,
	}
	index_path = os.path.join(output_dir, "index.json")
	with open(index_path, "w", encoding="utf-8") as handle:
		json.dump(index, handle, separators=(",", ":"))

	return index_path, len(chunks)


def build_index_from_chunks(output_dir):
	files = [
		name
		for name in os.listdir(output_dir)
		if name.startswith("lines-region-") and name.endswith(".geojson")
	]
	files.sort()
	chunks = []

	for name in files:
		path = os.path.join(output_dir, name)
		with open(path, "r", encoding="utf-8") as handle:
			payload = json.load(handle)
		features = payload.get("features", [])
		bbox = None
		for feature in features:
			bbox = merge_bbox(bbox, feature_bbox(feature))
		chunks.append(
			{
				"file": name,
				"bbox": bbox,
				"features": len(features),
				"bytes": os.path.getsize(path),
			}
		)

	index = {
		"source": "chunked",
		"generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
		"chunks": chunks,
	}
	index_path = os.path.join(output_dir, "index.json")
	with open(index_path, "w", encoding="utf-8") as handle:
		json.dump(index, handle, separators=(",", ":"))
	return index_path, len(chunks)


def inspect_geojson(input_path, limit):
	route_keys = set()
	keys = set()
	samples = []
	for index, feature in enumerate(iter_features(input_path)):
		props = feature.get("properties", {})
		keys.update(props.keys())
		for key in props.keys():
			lowered = key.lower()
			if "route" in lowered or "line" in lowered or "number" in lowered or "name" in lowered:
				route_keys.add(key)
		if index < 3:
			samples.append(props)
		if index + 1 >= limit:
			break

	print(f"Sampled {index + 1} feature(s)")
	print("Route-related keys:", sorted(route_keys))
	print("All keys (first 40):", sorted(keys)[:40])
	if samples:
		print("Sample properties (first 3 features):")
		for item in samples:
			print(item)



def main():
	parser = argparse.ArgumentParser(description="Inspect or split a line GeoJSON file.")
	parser.add_argument("input", help="Path to GeoJSON FeatureCollection")
	parser.add_argument("--inspect", action="store_true", help="Print schema info and exit")
	parser.add_argument("--limit", type=int, default=5, help="How many features to sample")
	parser.add_argument("--split", action="store_true", help="Split into chunk files")
	parser.add_argument(
		"--index-only",
		action="store_true",
		help="Create index.json from existing chunk files",
	)
	parser.add_argument("--output-dir", default="data/lines", help="Directory for chunk files")
	parser.add_argument("--target-mb", type=int, default=20, help="Target chunk size in MB")
	args = parser.parse_args()

	if args.inspect:
		inspect_geojson(args.input, args.limit)
		return

	if args.split:
		target_bytes = args.target_mb * 1024 * 1024
		index_path, count = split_geojson(args.input, args.output_dir, target_bytes)
		print(f"Wrote {count} chunk(s)")
		print(f"Index: {index_path}")
		return

	if args.index_only:
		index_path, count = build_index_from_chunks(args.output_dir)
		print(f"Indexed {count} chunk(s)")
		print(f"Index: {index_path}")
		return

	parser.error("Specify either --inspect or --split")


if __name__ == "__main__":
	main()
