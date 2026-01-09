// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('grpc');
var dice_pb = require('./dice_pb.js');

function serialize_dice_GameAssetsRequest(arg) {
  if (!(arg instanceof dice_pb.GameAssetsRequest)) {
    throw new Error('Expected argument of type dice.GameAssetsRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_dice_GameAssetsRequest(buffer_arg) {
  return dice_pb.GameAssetsRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_dice_GameAssetsResponse(arg) {
  if (!(arg instanceof dice_pb.GameAssetsResponse)) {
    throw new Error('Expected argument of type dice.GameAssetsResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_dice_GameAssetsResponse(buffer_arg) {
  return dice_pb.GameAssetsResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_dice_HealthRequest(arg) {
  if (!(arg instanceof dice_pb.HealthRequest)) {
    throw new Error('Expected argument of type dice.HealthRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_dice_HealthRequest(buffer_arg) {
  return dice_pb.HealthRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_dice_HealthResponse(arg) {
  if (!(arg instanceof dice_pb.HealthResponse)) {
    throw new Error('Expected argument of type dice.HealthResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_dice_HealthResponse(buffer_arg) {
  return dice_pb.HealthResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_dice_RollRequest(arg) {
  if (!(arg instanceof dice_pb.RollRequest)) {
    throw new Error('Expected argument of type dice.RollRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_dice_RollRequest(buffer_arg) {
  return dice_pb.RollRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_dice_RollResponse(arg) {
  if (!(arg instanceof dice_pb.RollResponse)) {
    throw new Error('Expected argument of type dice.RollResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_dice_RollResponse(buffer_arg) {
  return dice_pb.RollResponse.deserializeBinary(new Uint8Array(buffer_arg));
}


// Dice Service
var DiceServiceService = exports.DiceServiceService = {
  // Health check
health: {
    path: '/dice.DiceService/Health',
    requestStream: false,
    responseStream: false,
    requestType: dice_pb.HealthRequest,
    responseType: dice_pb.HealthResponse,
    requestSerialize: serialize_dice_HealthRequest,
    requestDeserialize: deserialize_dice_HealthRequest,
    responseSerialize: serialize_dice_HealthResponse,
    responseDeserialize: deserialize_dice_HealthResponse,
  },
  // Roll dice
roll: {
    path: '/dice.DiceService/Roll',
    requestStream: false,
    responseStream: false,
    requestType: dice_pb.RollRequest,
    responseType: dice_pb.RollResponse,
    requestSerialize: serialize_dice_RollRequest,
    requestDeserialize: deserialize_dice_RollRequest,
    responseSerialize: serialize_dice_RollResponse,
    responseDeserialize: deserialize_dice_RollResponse,
  },
  // Get game assets (HTML/JS/CSS for rendering)
getGameAssets: {
    path: '/dice.DiceService/GetGameAssets',
    requestStream: false,
    responseStream: false,
    requestType: dice_pb.GameAssetsRequest,
    responseType: dice_pb.GameAssetsResponse,
    requestSerialize: serialize_dice_GameAssetsRequest,
    requestDeserialize: deserialize_dice_GameAssetsRequest,
    responseSerialize: serialize_dice_GameAssetsResponse,
    responseDeserialize: deserialize_dice_GameAssetsResponse,
  },
};

exports.DiceServiceClient = grpc.makeGenericClientConstructor(DiceServiceService, 'DiceService');
