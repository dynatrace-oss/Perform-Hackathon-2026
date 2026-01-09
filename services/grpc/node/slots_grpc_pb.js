// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('grpc');
var slots_pb = require('./slots_pb.js');

function serialize_slots_GameAssetsRequest(arg) {
  if (!(arg instanceof slots_pb.GameAssetsRequest)) {
    throw new Error('Expected argument of type slots.GameAssetsRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_slots_GameAssetsRequest(buffer_arg) {
  return slots_pb.GameAssetsRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_slots_GameAssetsResponse(arg) {
  if (!(arg instanceof slots_pb.GameAssetsResponse)) {
    throw new Error('Expected argument of type slots.GameAssetsResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_slots_GameAssetsResponse(buffer_arg) {
  return slots_pb.GameAssetsResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_slots_HealthRequest(arg) {
  if (!(arg instanceof slots_pb.HealthRequest)) {
    throw new Error('Expected argument of type slots.HealthRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_slots_HealthRequest(buffer_arg) {
  return slots_pb.HealthRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_slots_HealthResponse(arg) {
  if (!(arg instanceof slots_pb.HealthResponse)) {
    throw new Error('Expected argument of type slots.HealthResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_slots_HealthResponse(buffer_arg) {
  return slots_pb.HealthResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_slots_SpinRequest(arg) {
  if (!(arg instanceof slots_pb.SpinRequest)) {
    throw new Error('Expected argument of type slots.SpinRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_slots_SpinRequest(buffer_arg) {
  return slots_pb.SpinRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_slots_SpinResponse(arg) {
  if (!(arg instanceof slots_pb.SpinResponse)) {
    throw new Error('Expected argument of type slots.SpinResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_slots_SpinResponse(buffer_arg) {
  return slots_pb.SpinResponse.deserializeBinary(new Uint8Array(buffer_arg));
}


// Slots Service
var SlotsServiceService = exports.SlotsServiceService = {
  // Health check
health: {
    path: '/slots.SlotsService/Health',
    requestStream: false,
    responseStream: false,
    requestType: slots_pb.HealthRequest,
    responseType: slots_pb.HealthResponse,
    requestSerialize: serialize_slots_HealthRequest,
    requestDeserialize: deserialize_slots_HealthRequest,
    responseSerialize: serialize_slots_HealthResponse,
    responseDeserialize: deserialize_slots_HealthResponse,
  },
  // Spin slots
spin: {
    path: '/slots.SlotsService/Spin',
    requestStream: false,
    responseStream: false,
    requestType: slots_pb.SpinRequest,
    responseType: slots_pb.SpinResponse,
    requestSerialize: serialize_slots_SpinRequest,
    requestDeserialize: deserialize_slots_SpinRequest,
    responseSerialize: serialize_slots_SpinResponse,
    responseDeserialize: deserialize_slots_SpinResponse,
  },
  // Get game assets (HTML/JS/CSS for rendering)
getGameAssets: {
    path: '/slots.SlotsService/GetGameAssets',
    requestStream: false,
    responseStream: false,
    requestType: slots_pb.GameAssetsRequest,
    responseType: slots_pb.GameAssetsResponse,
    requestSerialize: serialize_slots_GameAssetsRequest,
    requestDeserialize: deserialize_slots_GameAssetsRequest,
    responseSerialize: serialize_slots_GameAssetsResponse,
    responseDeserialize: deserialize_slots_GameAssetsResponse,
  },
};

exports.SlotsServiceClient = grpc.makeGenericClientConstructor(SlotsServiceService, 'SlotsService');
