import json
import os
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
    physical_id = client.activate_gateway(
        ActivationKey=props["ActivationKey"],
        GatewayName=props["GatewayName"],
        GatewayTimezone=props["GatewayTimezone"],
        GatewayRegion=props["GatewayRegion"],
        GatewayType=props["GatewayType"],
    )
    while True:
        try:
            disks = client.list_local_disks(GatewayARN=physical_id["GatewayARN"])
            break
        except Exception as e:
            print(e)

    print(disks)
    client.add_cache(
        GatewayARN=physical_id["GatewayARN"], DiskIds=[disks["Disks"][0]["DiskId"]]
    )
    client.set_smb_guest_password(
        GatewayARN=physical_id["GatewayARN"], Password=secrets["GuestPassword"]
    )

    client.update_gateway_information(
        GatewayARN=physical_id["GatewayARN"], CloudWatchLogGroupARN=props["LogARN"]
    )

    return {"PhysicalResourceId": physical_id["GatewayARN"]}


def on_update(event):
    physical_id = event["PhysicalResourceId"]
    props = event["ResourceProperties"]
    print("update resource %s with props %s" % (physical_id, props))


def on_delete(event):
    physical_id = event["PhysicalResourceId"]
    print("delete resource %s" % physical_id)
    return client.delete_gateway(GatewayARN=physical_id)


1
