"""
Migration script to upgrade the Milvus collection schema to version 2.
This schema introduces:
- emp_id: String mapping to PostgreSQL employee identifier
- template_version: Int64 template revision identifier for re-enrollment audits
- created_at: Double registration timestamp
- embedding: Float vector (512-dim)
"""
import os
import sys
from pathlib import Path

# Ensure imports resolve when running from ml_service folder
ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))

from pymilvus import connections, Collection, CollectionSchema, FieldSchema, DataType, utility

def main():
    host = os.getenv("MILVUS_HOST", "localhost")
    port = os.getenv("MILVUS_PORT", "19530")
    
    print(f"Connecting to Milvus at {host}:{port}...")
    try:
        connections.connect(alias="default", host=host, port=port)
        print("Connected to Milvus successfully.")
    except Exception as e:
        print(f"Failed to connect to Milvus: {e}")
        sys.exit(1)
        
    collection_name = "face_embeddings"
    
    if utility.has_collection(collection_name):
        print(f"Collection '{collection_name}' exists. Dropping existing collection...")
        try:
            col = Collection(collection_name)
            col.drop()
            print("Collection dropped successfully.")
        except Exception as e:
            print(f"Failed to drop collection: {e}")
            sys.exit(1)
            
    print(f"Creating new collection '{collection_name}' with Schema v2...")
    
    fields = [
        FieldSchema(name="id", dtype=DataType.INT64, is_primary=True, auto_id=True),
        FieldSchema(name="emp_id", dtype=DataType.VARCHAR, max_length=64),
        FieldSchema(name="template_version", dtype=DataType.INT64),
        FieldSchema(name="created_at", dtype=DataType.DOUBLE),
        FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=512)
    ]
    
    schema = CollectionSchema(fields=fields, description="Face embeddings collection with Pose/Version tracking (v2)")
    
    try:
        collection = Collection(name=collection_name, schema=schema)
        print("Collection created successfully.")
        
        print("Creating index on 'embedding' field...")
        index_params = {
            "metric_type": "IP",
            "index_type": "IVF_FLAT",
            "params": {"nlist": 1024}
        }
        collection.create_index(field_name="embedding", index_params=index_params)
        print("Index created successfully.")
        
        collection.load()
        print("Collection loaded. Schema v2 migration complete.")
    except Exception as e:
        print(f"Failed to setup collection: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
