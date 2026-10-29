"use strict";

const root = require("node-gyp-build")(__dirname + "/../..");

module.exports = root;

module.exports.nodeTypeInfo = require("../../src/node-types.json");
