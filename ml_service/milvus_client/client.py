"""
Milvus Client Module
Handles connections and operations with Milvus vector database
"""
from pymilvus import (
    connections,
    Collection,
    CollectionSchema,
    FieldSchema,
    DataType,
    utility
)
import numpy as np
import logging
from typing import Optional, Dict, List
import os

logger = logging.getLogger(__name__)

class MilvusClient:
    """
    Client for interacting with Milvus vector database
    """
    
    # Configuration
    COLLECTION_NAME = "face_embeddings"
    EMBEDDING_DIM = 512
    INDEX_TYPE = "IVF_FLAT"
    METRIC_TYPE = "IP"  # Inner Product (cosine similarity for normalized vectors)
    NLIST = 1024  # Number of clusters for IVF
    
    def __init__(
        self,
        host: Optional[str] = None,
        port: Optional[str] = None
    ):
        """
        Initialize Milvus client
        
        Args:
            host: Milvus host (default: localhost or env MILVUS_HOST)
            port: Milvus port (default: 19530 or env MILVUS_PORT)
        """
        self.host = host or os.getenv("MILVUS_HOST", "localhost")
        self.port = port or os.getenv("MILVUS_PORT", "19530")
        
        logger.info(f"Initializing MilvusClient...")
        logger.info(f"Connecting to Milvus at {self.host}:{self.port}")
        
        # Connect to Milvus
        self._connect()
        
        # Create or load collection
        self._setup_collection()
        
        logger.info("MilvusClient initialized successfully")
    
    def _connect(self):
        """Establish connection to Milvus"""
        try:
            connections.connect(
                alias="default",
                host=self.host,
                port=self.port
            )
            logger.info("Connected to Milvus successfully")
        except Exception as e:
            logger.error(f"Failed to connect to Milvus: {str(e)}")
            raise
    
    def _setup_collection(self):
        """Create or load the face embeddings collection"""
        try:
            # Check if collection exists
            if utility.has_collection(self.COLLECTION_NAME):
                logger.info(f"Collection '{self.COLLECTION_NAME}' exists, verifying schema...")
                col = Collection(self.COLLECTION_NAME)
                
                # Verify Version 2 fields (emp_id, template_version)
                has_emp_id = any(field.name == "emp_id" for field in col.schema.fields)
                has_version = any(field.name == "template_version" for field in col.schema.fields)
                
                if not has_emp_id or not has_version:
                    error_msg = (
                        f"Milvus collection '{self.COLLECTION_NAME}' schema version mismatch (v1 detected). "
                        "Please run 'python scripts/migrate_milvus_v2.py' to migrate the schema to version 2."
                    )
                    logger.critical(error_msg)
                    raise RuntimeError(error_msg)
                
                self.collection = col
                self.collection.load()
                logger.info(f"Collection '{self.COLLECTION_NAME}' loaded successfully (Schema v2 verified).")
            else:
                logger.info(f"Creating new collection '{self.COLLECTION_NAME}'...")
                self._create_collection()
                
        except Exception as e:
            logger.error(f"Failed to setup collection: {str(e)}")
            raise
    
    def _create_collection(self):
        """Create a new collection with schema v2"""
        fields = [
            FieldSchema(
                name="id",
                dtype=DataType.INT64,
                is_primary=True,
                auto_id=True
            ),
            FieldSchema(
                name="emp_id",
                dtype=DataType.VARCHAR,
                max_length=64
            ),
            FieldSchema(
                name="template_version",
                dtype=DataType.INT64
            ),
            FieldSchema(
                name="created_at",
                dtype=DataType.DOUBLE
            ),
            FieldSchema(
                name="embedding",
                dtype=DataType.FLOAT_VECTOR,
                dim=self.EMBEDDING_DIM
            )
        ]
        
        schema = CollectionSchema(
            fields=fields,
            description="Face embeddings collection with Pose/Version tracking (v2)"
        )
        
        # Create collection
        self.collection = Collection(
            name=self.COLLECTION_NAME,
            schema=schema
        )
        
        # Create index
        index_params = {
            "metric_type": self.METRIC_TYPE,
            "index_type": self.INDEX_TYPE,
            "params": {"nlist": self.NLIST}
        }
        
        self.collection.create_index(
            field_name="embedding",
            index_params=index_params
        )
        
        # Load collection
        self.collection.load()
        
        logger.info(f"Collection '{self.COLLECTION_NAME}' created and loaded")
    
    def is_connected(self) -> bool:
        """Check if connected to Milvus"""
        try:
            return utility.has_collection(self.COLLECTION_NAME)
        except:
            return False

    def drop_collection(self) -> bool:
        """Drop the embeddings collection if it exists"""
        try:
            if utility.has_collection(self.COLLECTION_NAME):
                Collection(self.COLLECTION_NAME).drop()
                logger.info(f"Dropped collection '{self.COLLECTION_NAME}'")
            return True
        except Exception as e:
            logger.error(f"Failed to drop collection: {str(e)}")
            return False
    
    def insert_face(self, emp_id: str, embedding: np.ndarray, template_version: int = 1) -> str:
        """
        Insert a new face embedding with emp_id and template_version (Schema v2)
        
        Args:
            emp_id: Employee ID
            embedding: Face embedding vector
            template_version: Version of the template
            
        Returns:
            milvus_id: Generated Milvus primary key
        """
        try:
            import time
            # Prepare data aligned with schema fields
            data = [
                [emp_id],                     # emp_id
                [template_version],           # template_version
                [time.time()],                # created_at
                [embedding.tolist()]          # embedding
            ]
            
            # Insert
            result = self.collection.insert(data)
            self.collection.flush()

            milvus_id = str(result.primary_keys[0]) if result.primary_keys else None
            if milvus_id is None:
                raise RuntimeError("Milvus did not return primary key")

            logger.info(f"Inserted face embedding for {emp_id} (version {template_version}) with milvus_id: {milvus_id}")

            return milvus_id
            
        except Exception as e:
            logger.error(f"Failed to insert face: {str(e)}")
            raise
    
    def get_max_template_version(self, emp_id: str) -> int:
        """Query existing templates to find the highest template version for an employee"""
        try:
            results = self.collection.query(
                expr=f'emp_id == "{emp_id}"',
                output_fields=["template_version"],
                limit=100
            )
            if not results:
                return 0
            versions = [res.get("template_version", 1) for res in results]
            return max(versions) if versions else 0
        except Exception as e:
            logger.error(f"Failed to query template versions for employee {emp_id}: {str(e)}")
            return 0

    def search_face(
        self,
        embedding: np.ndarray,
        top_k: int = 5
    ) -> Optional[Dict]:
        """
        Search for similar faces and return best score after collapsing templates
        """
        results = self.search_faces([embedding], top_k=top_k)
        return results[0] if results else None

    def search_faces(
        self,
        embeddings: List[np.ndarray],
        top_k: int = 5
    ) -> List[Optional[Dict]]:
        """
        Batch search for face embeddings, grouping by employee and collapsing template versions.
        """
        if not embeddings:
            return []

        try:
            search_params = {
                "metric_type": self.METRIC_TYPE,
                "params": {"nprobe": 10}
            }

            results = self.collection.search(
                data=[emb.tolist() for emb in embeddings],
                anns_field="embedding",
                param=search_params,
                limit=top_k,
                output_fields=["emp_id", "template_version"]
            )

            output = []
            for res in results:
                if not res or len(res) == 0:
                    output.append(None)
                    continue
                
                emp_matches = {}
                for hit in res:
                    hit_emp_id = hit.entity.get("emp_id")
                    hit_ver = hit.entity.get("template_version")
                    if hit_ver is None:
                        hit_ver = 1
                    hit_score = float(hit.distance)
                    hit_id = str(hit.id)
                    
                    # Fallback to legcy Milvus auto-id if emp_id is missing or starts with "legacy_"
                    identity = hit_emp_id if (hit_emp_id and not hit_emp_id.startswith("legacy_")) else hit_id
                    
                    if identity not in emp_matches:
                        emp_matches[identity] = {
                            "person_id": identity,
                            "confidence": hit_score,
                            "template_version": hit_ver
                        }
                    else:
                        existing = emp_matches[identity]
                        if hit_ver > existing["template_version"]:
                            # Higher template version takes precedence
                            emp_matches[identity] = {
                                "person_id": identity,
                                "confidence": hit_score,
                                "template_version": hit_ver
                            }
                        elif hit_ver == existing["template_version"] and hit_score > existing["confidence"]:
                            # Tie-breaker: higher similarity score
                            existing["confidence"] = hit_score
                            
                if not emp_matches:
                    output.append(None)
                    continue
                    
                # Pick the match with the highest confidence
                best_match = max(emp_matches.values(), key=lambda x: x["confidence"])
                output.append({
                    "person_id": best_match["person_id"],
                    "confidence": best_match["confidence"]
                })
            return output

        except Exception as e:
            logger.error(f"Batch search failed: {str(e)}")
            raise
    
    def delete_employee_faces(self, emp_id: str) -> bool:
        """
        Delete all face embeddings for an employee
        """
        try:
            expr = f'emp_id == "{emp_id}"'
            self.collection.delete(expr)
            self.collection.flush()
            logger.info(f"Deleted face embeddings for employee: {emp_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete faces for employee {emp_id}: {str(e)}")
            return False
            
    def delete_face(self, milvus_id: str) -> bool:
        """
        Delete a face by Milvus primary key
        
        Args:
            milvus_id: Milvus primary key
            
        Returns:
            True if successful
        """
        try:
            expr = f'id == {int(milvus_id)}'
            self.collection.delete(expr)
            self.collection.flush()

            logger.info(f"Deleted face with milvus_id: {milvus_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete face: {str(e)}")
            return False
    
    def get_stats(self) -> Dict:
        """
        Get collection statistics
        
        Returns:
            Dictionary with stats
        """
        try:
            self.collection.flush()
            
            return {
                "total_faces": self.collection.num_entities,
                "collection_name": self.COLLECTION_NAME,
                "embedding_dim": self.EMBEDDING_DIM
            }
            
        except Exception as e:
            logger.error(f"Failed to get stats: {str(e)}")
            return {}
    
    def disconnect(self):
        """Disconnect from Milvus"""
        try:
            connections.disconnect("default")
            logger.info("Disconnected from Milvus")
        except Exception as e:
            logger.error(f"Error disconnecting: {str(e)}")
