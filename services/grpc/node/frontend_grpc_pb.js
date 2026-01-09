// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('grpc');
var frontend_pb = require('./frontend_pb.js');

function serialize_frontend_GameAssetsRequest(arg) {
  if (!(arg instanceof frontend_pb.GameAssetsRequest)) {
    throw new Error('Expected argument of type frontend.GameAssetsRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_frontend_GameAssetsRequest(buffer_arg) {
  return frontend_pb.GameAssetsRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_frontend_GameAssetsResponse(arg) {
  if (!(arg instanceof frontend_pb.GameAssetsResponse)) {
    throw new Error('Expected argument of type frontend.GameAssetsResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_frontend_GameAssetsResponse(buffer_arg) {
  return frontend_pb.GameAssetsResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_frontend_GamesRequest(arg) {
  if (!(arg instanceof frontend_pb.GamesRequest)) {
    throw new Error('Expected argument of type frontend.GamesRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_frontend_GamesRequest(buffer_arg) {
  return frontend_pb.GamesRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_frontend_GamesResponse(arg) {
  if (!(arg instanceof frontend_pb.GamesResponse)) {
    throw new Error('Expected argument of type frontend.GamesResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_frontend_GamesResponse(buffer_arg) {
  return frontend_pb.GamesResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_frontend_HealthRequest(arg) {
  if (!(arg instanceof frontend_pb.HealthRequest)) {
    throw new Error('Expected argument of type frontend.HealthRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_frontend_HealthRequest(buffer_arg) {
  return frontend_pb.HealthRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_frontend_HealthResponse(arg) {
  if (!(arg instanceof frontend_pb.HealthResponse)) {
    throw new Error('Expected argument of type frontend.HealthResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_frontend_HealthResponse(buffer_arg) {
  return frontend_pb.HealthResponse.deserializeBinary(new Uint8Array(buffer_arg));
}


// Frontend Service - Aggregates game assets and provides unified interface
var FrontendServiceService = exports.FrontendServiceService = {
  // Get all available games
getGames: {
    path: '/frontend.FrontendService/GetGames',
    requestStream: false,
    responseStream: false,
    requestType: frontend_pb.GamesRequest,
    responseType: frontend_pb.GamesResponse,
    requestSerialize: serialize_frontend_GamesRequest,
    requestDeserialize: deserialize_frontend_GamesRequest,
    responseSerialize: serialize_frontend_GamesResponse,
    responseDeserialize: deserialize_frontend_GamesResponse,
  },
  // Get game assets for a specific game
getGameAssets: {
    path: '/frontend.FrontendService/GetGameAssets',
    requestStream: false,
    responseStream: false,
    requestType: frontend_pb.GameAssetsRequest,
    responseType: frontend_pb.GameAssetsResponse,
    requestSerialize: serialize_frontend_GameAssetsRequest,
    requestDeserialize: deserialize_frontend_GameAssetsRequest,
    responseSerialize: serialize_frontend_GameAssetsResponse,
    responseDeserialize: deserialize_frontend_GameAssetsResponse,
  },
  // Health check
health: {
    path: '/frontend.FrontendService/Health',
    requestStream: false,
    responseStream: false,
    requestType: frontend_pb.HealthRequest,
    responseType: frontend_pb.HealthResponse,
    requestSerialize: serialize_frontend_HealthRequest,
    requestDeserialize: deserialize_frontend_HealthRequest,
    responseSerialize: serialize_frontend_HealthResponse,
    responseDeserialize: deserialize_frontend_HealthResponse,
  },
};

exports.FrontendServiceClient = grpc.makeGenericClientConstructor(FrontendServiceService, 'FrontendService');
