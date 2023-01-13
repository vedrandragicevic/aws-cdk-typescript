from ast import Try
import json
import os
from telnetlib import AUTHENTICATION
import boto3
import logging
from http import HTTPStatus
import json
from botocore.exceptions import ClientError
import time
import urllib
from urllib.parse import unquote
import time

client = boto3.client("storagegateway")
manager = boto3.client("secretsmanager")


def on_event(event, context):
    print(event)
    request_type = event["RequestType"]
    if request_type == "Create":
        return on_create(event)
    if request_type == "Update":
        return on_update(event)
    if request_type == "Delete":
        return on_delete(event)
    raise Exception("Invalid request type: %s" % request_type)


def on_create(event):
    props = event["ResourceProperties"]
    print("create new resource with props %s" % props)
    secrets = manager.get_secret_value(SecretId=props["SecretId"])
    secrets = json.loads(secrets["SecretString"])

    if props["ShareType"] == "SMB":
        physical_id = client.create_smb_file_share(
            ClientToken=secrets[props["ClientToken"]],
            GatewayARN=props["GatewayARN"],
            Role=props["Role"],
            LocationARN=props["LocationARN"],
            Authentication="GuestAccess",
            FileShareName=props["FileShareName"],
            AuditDestinationARN=props["AuditDestinationARN"],
        )
    elif props["ShareType"] == "NFS":
        physical_id = client.create_nfs_file_share(
            ClientToken=secrets[props["ClientToken"]],
            GatewayARN=props["GatewayARN"],
            Role=props["Role"],
            LocationARN=props["LocationARN"],
            ClientList=[props["ClientList"]],
            FileShareName=props["FileShareName"],
            AuditDestinationARN=props["AuditDestinationARN"],
        )

    return {"PhysicalResourceId": physical_id["FileShareARN"]}


def on_update(event):
    physical_id = event["PhysicalResourceId"]
    props = event["ResourceProperties"]
    print("update resource %s with props %s" % (physical_id, props))


def on_delete(event):
    physical_id = event["PhysicalResourceId"]
    print("delete resource %s" % physical_id)

    return client.delete_file_share(FileShareARN=physical_id)
