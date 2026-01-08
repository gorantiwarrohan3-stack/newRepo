"""
AWS Lambda handler wrapper
This file imports from main.py and exports the handler
"""
from main import handler

# Export handler for AWS Lambda
__all__ = ['handler']

