// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('grpc');
var blackjack_pb = require('./blackjack_pb.js');

function serialize_blackjack_DealRequest(arg) {
  if (!(arg instanceof blackjack_pb.DealRequest)) {
    throw new Error('Expected argument of type blackjack.DealRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_blackjack_DealRequest(buffer_arg) {
  return blackjack_pb.DealRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_blackjack_DealResponse(arg) {
  if (!(arg instanceof blackjack_pb.DealResponse)) {
    throw new Error('Expected argument of type blackjack.DealResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_blackjack_DealResponse(buffer_arg) {
  return blackjack_pb.DealResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_blackjack_DoubleRequest(arg) {
  if (!(arg instanceof blackjack_pb.DoubleRequest)) {
    throw new Error('Expected argument of type blackjack.DoubleRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_blackjack_DoubleRequest(buffer_arg) {
  return blackjack_pb.DoubleRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_blackjack_DoubleResponse(arg) {
  if (!(arg instanceof blackjack_pb.DoubleResponse)) {
    throw new Error('Expected argument of type blackjack.DoubleResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_blackjack_DoubleResponse(buffer_arg) {
  return blackjack_pb.DoubleResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_blackjack_GameAssetsRequest(arg) {
  if (!(arg instanceof blackjack_pb.GameAssetsRequest)) {
    throw new Error('Expected argument of type blackjack.GameAssetsRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_blackjack_GameAssetsRequest(buffer_arg) {
  return blackjack_pb.GameAssetsRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_blackjack_GameAssetsResponse(arg) {
  if (!(arg instanceof blackjack_pb.GameAssetsResponse)) {
    throw new Error('Expected argument of type blackjack.GameAssetsResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_blackjack_GameAssetsResponse(buffer_arg) {
  return blackjack_pb.GameAssetsResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_blackjack_HealthRequest(arg) {
  if (!(arg instanceof blackjack_pb.HealthRequest)) {
    throw new Error('Expected argument of type blackjack.HealthRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_blackjack_HealthRequest(buffer_arg) {
  return blackjack_pb.HealthRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_blackjack_HealthResponse(arg) {
  if (!(arg instanceof blackjack_pb.HealthResponse)) {
    throw new Error('Expected argument of type blackjack.HealthResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_blackjack_HealthResponse(buffer_arg) {
  return blackjack_pb.HealthResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_blackjack_HitRequest(arg) {
  if (!(arg instanceof blackjack_pb.HitRequest)) {
    throw new Error('Expected argument of type blackjack.HitRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_blackjack_HitRequest(buffer_arg) {
  return blackjack_pb.HitRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_blackjack_HitResponse(arg) {
  if (!(arg instanceof blackjack_pb.HitResponse)) {
    throw new Error('Expected argument of type blackjack.HitResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_blackjack_HitResponse(buffer_arg) {
  return blackjack_pb.HitResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_blackjack_StandRequest(arg) {
  if (!(arg instanceof blackjack_pb.StandRequest)) {
    throw new Error('Expected argument of type blackjack.StandRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_blackjack_StandRequest(buffer_arg) {
  return blackjack_pb.StandRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_blackjack_StandResponse(arg) {
  if (!(arg instanceof blackjack_pb.StandResponse)) {
    throw new Error('Expected argument of type blackjack.StandResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_blackjack_StandResponse(buffer_arg) {
  return blackjack_pb.StandResponse.deserializeBinary(new Uint8Array(buffer_arg));
}


// Blackjack Service
var BlackjackServiceService = exports.BlackjackServiceService = {
  // Health check
health: {
    path: '/blackjack.BlackjackService/Health',
    requestStream: false,
    responseStream: false,
    requestType: blackjack_pb.HealthRequest,
    responseType: blackjack_pb.HealthResponse,
    requestSerialize: serialize_blackjack_HealthRequest,
    requestDeserialize: deserialize_blackjack_HealthRequest,
    responseSerialize: serialize_blackjack_HealthResponse,
    responseDeserialize: deserialize_blackjack_HealthResponse,
  },
  // Deal initial cards
deal: {
    path: '/blackjack.BlackjackService/Deal',
    requestStream: false,
    responseStream: false,
    requestType: blackjack_pb.DealRequest,
    responseType: blackjack_pb.DealResponse,
    requestSerialize: serialize_blackjack_DealRequest,
    requestDeserialize: deserialize_blackjack_DealRequest,
    responseSerialize: serialize_blackjack_DealResponse,
    responseDeserialize: deserialize_blackjack_DealResponse,
  },
  // Player hits
hit: {
    path: '/blackjack.BlackjackService/Hit',
    requestStream: false,
    responseStream: false,
    requestType: blackjack_pb.HitRequest,
    responseType: blackjack_pb.HitResponse,
    requestSerialize: serialize_blackjack_HitRequest,
    requestDeserialize: deserialize_blackjack_HitRequest,
    responseSerialize: serialize_blackjack_HitResponse,
    responseDeserialize: deserialize_blackjack_HitResponse,
  },
  // Player stands
stand: {
    path: '/blackjack.BlackjackService/Stand',
    requestStream: false,
    responseStream: false,
    requestType: blackjack_pb.StandRequest,
    responseType: blackjack_pb.StandResponse,
    requestSerialize: serialize_blackjack_StandRequest,
    requestDeserialize: deserialize_blackjack_StandRequest,
    responseSerialize: serialize_blackjack_StandResponse,
    responseDeserialize: deserialize_blackjack_StandResponse,
  },
  // Player doubles down
double: {
    path: '/blackjack.BlackjackService/Double',
    requestStream: false,
    responseStream: false,
    requestType: blackjack_pb.DoubleRequest,
    responseType: blackjack_pb.DoubleResponse,
    requestSerialize: serialize_blackjack_DoubleRequest,
    requestDeserialize: deserialize_blackjack_DoubleRequest,
    responseSerialize: serialize_blackjack_DoubleResponse,
    responseDeserialize: deserialize_blackjack_DoubleResponse,
  },
  // Get game assets (HTML/JS/CSS for rendering)
getGameAssets: {
    path: '/blackjack.BlackjackService/GetGameAssets',
    requestStream: false,
    responseStream: false,
    requestType: blackjack_pb.GameAssetsRequest,
    responseType: blackjack_pb.GameAssetsResponse,
    requestSerialize: serialize_blackjack_GameAssetsRequest,
    requestDeserialize: deserialize_blackjack_GameAssetsRequest,
    responseSerialize: serialize_blackjack_GameAssetsResponse,
    responseDeserialize: deserialize_blackjack_GameAssetsResponse,
  },
};

exports.BlackjackServiceClient = grpc.makeGenericClientConstructor(BlackjackServiceService, 'BlackjackService');
