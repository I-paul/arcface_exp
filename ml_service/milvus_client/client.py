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
                logger.info(f"Collection '{self.COLLECTION_NAME}' exists, loading...")
                self.collection = Collection(self.COLLECTION_NAME)
                self.collection.load()
            else:
                logger.info(f"Creating new collection '{self.COLLECTION_NAME}'...")
                self._create_collection()
                
        except Exception as e:
            logger.error(f"Failed to setup collection: {str(e)}")
            raise
    
    def _create_collection(self):
        """Create a new collection with schema"""
        # Define schema
        fields = [
            FieldSchema(
                name="id",
                dtype=DataType.INT64,
                is_primary=True,
                auto_id=True
            ),
            FieldSchema(
                name="person_id",
                dtype=DataType.VARCHAR,
                max_length=100
            ),
            FieldSchema(
                name="name",
                dtype=DataType.VARCHAR,
                max_length=200
            ),
            FieldSchema(
                name="embedding",
                dtype=DataType.FLOAT_VECTOR,
                dim=self.EMBEDDING_DIM
            )
        ]
        
        schema = CollectionSchema(
            fields=fields,
            description="Face embeddings collection"
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
    
    def insert_face(self, name: str, embedding: np.ndarray) -> str:
        """
        Insert a new face embedding
        
        Args:
            name: Person's name
            embedding: Face embedding vector
            
        Returns:
            person_id: Unique identifier for the person
        """
        try:
            # Generate person_id
            person_id = f"person_{int(np.random.random() * 1e9)}"
            
            # Prepare data
            data = [
                [person_id],  # person_id
                [name],       # name
                [embedding.tolist()]  # embedding
            ]
            
            # Insert
            result = self.collection.insert(data)
            self.collection.flush()
            
            logger.info(f"Inserted face for {name} with person_id: {person_id}")
            
            return person_id
            
        except Exception as e:
            logger.error(f"Failed to insert face: {str(e)}")
            raise
    
    def search_face(
        self,
        embedding: np.ndarray,
        top_k: int = 1
    ) -> Optional[Dict]:
        """
        Search for similar faces
        
        Args:
            embedding: Query embedding
            top_k: Number of results to return
            
        Returns:
            Dictionary with name and confidence, or None if no match
        """
        try:
            # Prepare search params
            search_params = {
                "metric_type": self.METRIC_TYPE,
                "params": {"nprobe": 10}
            }
            
            # Search
            results = self.collection.search(
                data=[embedding.tolist()],
                anns_field="embedding",
                param=search_params,
                limit=top_k,
                output_fields=["name", "person_id"]
            )
            
            if not results or len(results[0]) == 0:
                return None
            
            # Get top result
            top_result = results[0][0]
            
            return {
                "name": top_result.entity.get("name"),
                "person_id": top_result.entity.get("person_id"),
                "confidence": float(top_result.distance)
            }
            
        except Exception as e:
            logger.error(f"Search failed: {str(e)}")
            raise

    def search_faces(
        self,
        embeddings: List[np.ndarray],
        top_k: int = 1
    ) -> List[Optional[Dict]]:
        """
        Batch search for multiple face embeddings.

        Args:
            embeddings: List of embeddings
            top_k: Number of results to return per embedding

        Returns:
            List of results, each item is a dict or None
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
                output_fields=["name", "person_id"]
            )

            output = []
            for res in results:
                if not res or len(res) == 0:
                    output.append(None)
                    continue
                top_result = res[0]
                output.append({
                    "name": top_result.entity.get("name"),
                    "person_id": top_result.entity.get("person_id"),
                    "confidence": float(top_result.distance)
                })
            return output

        except Exception as e:
            logger.error(f"Batch search failed: {str(e)}")
            raise
    
    def delete_face(self, person_id: str) -> bool:
        """
        Delete a face by person_id
        
        Args:
            person_id: Person identifier
            
        Returns:
            True if successful
        """
        try:
            expr = f'person_id == "{person_id}"'
            self.collection.delete(expr)
            self.collection.flush()
            
            logger.info(f"Deleted face with person_id: {person_id}")
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
