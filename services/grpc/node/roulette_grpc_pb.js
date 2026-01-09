// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('grpc');
var roulette_pb = require('./roulette_pb.js');

function serialize_roulette_GameAssetsRequest(arg) {
  if (!(arg instanceof roulette_pb.GameAssetsRequest)) {
    throw new Error('Expected argument of type roulette.GameAssetsRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_roulette_GameAssetsRequest(buffer_arg) {
  return roulette_pb.GameAssetsRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_roulette_GameAssetsResponse(arg) {
  if (!(arg instanceof roulette_pb.GameAssetsResponse)) {
    throw new Error('Expected argument of type roulette.GameAssetsResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_roulette_GameAssetsResponse(buffer_arg) {
  return roulette_pb.GameAssetsResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_roulette_HealthRequest(arg) {
  if (!(arg instanceof roulette_pb.HealthRequest)) {
    throw new Error('Expected argument of type roulette.HealthRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_roulette_HealthRequest(buffer_arg) {
  return roulette_pb.HealthRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_roulette_HealthResponse(arg) {
  if (!(arg instanceof roulette_pb.HealthResponse)) {
    throw new Error('Expected argument of type roulette.HealthResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_roulette_HealthResponse(buffer_arg) {
  return roulette_pb.HealthResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_roulette_SpinRequest(arg) {
  if (!(arg instanceof roulette_pb.SpinRequest)) {
    throw new Error('Expected argument of type roulette.SpinRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_roulette_SpinRequest(buffer_arg) {
  return roulette_pb.SpinRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_roulette_SpinResponse(arg) {
  if (!(arg instanceof roulette_pb.SpinResponse)) {
    throw new Error('Expected argument of type roulette.SpinResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_roulette_SpinResponse(buffer_arg) {
  return roulette_pb.SpinResponse.deserializeBinary(new Uint8Array(buffer_arg));
}


// Roulette Service
var RouletteServiceService = exports.RouletteServiceService = {
  // Health check
health: {
    path: '/roulette.RouletteService/Health',
    requestStream: false,
    responseStream: false,
    requestType: roulette_pb.HealthRequest,
    responseType: roulette_pb.HealthResponse,
    requestSerialize: serialize_roulette_HealthRequest,
    requestDeserialize: deserialize_roulette_HealthRequest,
    responseSerialize: serialize_roulette_HealthResponse,
    responseDeserialize: deserialize_roulette_HealthResponse,
  },
  // Spin roulette wheel
spin: {
    path: '/roulette.RouletteService/Spin',
    requestStream: false,
    responseStream: false,
    requestType: roulette_pb.SpinRequest,
    responseType: roulette_pb.SpinResponse,
    requestSerialize: serialize_roulette_SpinRequest,
    requestDeserialize: deserialize_roulette_SpinRequest,
    responseSerialize: serialize_roulette_SpinResponse,
    responseDeserialize: deserialize_roulette_SpinResponse,
  },
  // Get game assets (HTML/JS/CSS for rendering)
getGameAssets: {
    path: '/roulette.RouletteService/GetGameAssets',
    requestStream: false,
    responseStream: false,
    requestType: roulette_pb.GameAssetsRequest,
    responseType: roulette_pb.GameAssetsResponse,
    requestSerialize: serialize_roulette_GameAssetsRequest,
    requestDeserialize: deserialize_roulette_GameAssetsRequest,
    responseSerialize: serialize_roulette_GameAssetsResponse,
    responseDeserialize: deserialize_roulette_GameAssetsResponse,
  },
};

exports.RouletteServiceClient = grpc.makeGenericClientConstructor(RouletteServiceService, 'RouletteService');
