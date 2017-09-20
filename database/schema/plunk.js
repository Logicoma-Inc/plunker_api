var Document, Mixed, ObjectId, PlunkChangeSchema, PlunkFileSchema, PlunkHistorySchema, PlunkSchema, PlunkVoteSchema, Query, Schema, apiUrl, genid, mime, mongoose, nconf, ref, runUrl, wwwUrl;

mongoose = require("mongoose");

genid = require("genid");

nconf = require("nconf");

mime = require("mime");

Schema = mongoose.Schema, Document = mongoose.Document, Query = mongoose.Query;

ref = Schema.Types, ObjectId = ref.ObjectId, Mixed = ref.Mixed;

wwwUrl = nconf.get("url:www");

apiUrl = nconf.get("url:api");

runUrl = nconf.get("url:run");

PlunkFileSchema = new Schema({
  filename: String,
  content: String
});

PlunkVoteSchema = new Schema({
  user: {
    type: Schema.ObjectId,
    ref: "User"
  },
  created_at: {
    type: Date,
    'default': Date.now
  }
});

PlunkChangeSchema = new Schema({
  fn: String,
  pn: String,
  pl: String
});

PlunkHistorySchema = new Schema({
  event: {
    type: String,
    'enum': ["create", "update", "fork"]
  },
  user: {
    type: Schema.ObjectId,
    ref: "User"
  },
  changes: [PlunkChangeSchema]
});

PlunkHistorySchema.virtual("created_at").get(function() {
  return new Date(parseInt(this._id.toString().substring(0, 8), 16) * 1000);
});

PlunkSchema = new Schema({
  _id: {
    type: String,
    index: true
  },
  description: String,
  score: {
    type: Number,
    'default': Date.now
  },
  thumbs: {
    type: Number,
    'default': 0
  },
  created_at: {
    type: Date,
    'default': Date.now
  },
  updated_at: {
    type: Date,
    'default': Date.now
  },
  token: {
    type: String,
    'default': genid.bind(null, 16)
  },
  'private': {
    type: Boolean,
    'default': false,
    index: true
  },
  template: {
    type: Boolean,
    'default': false
  },
  source: {},
  files: [PlunkFileSchema],
  user: {
    type: Schema.ObjectId,
    ref: "User",
    index: true
  },
  comments: {
    type: Number,
    'default': 0
  },
  fork_of: {
    type: String,
    ref: "Plunk",
    index: true
  },
  forks: [
    {
      type: String,
      ref: "Plunk",
      index: true
    }
  ],
  tags: [
    {
      type: String,
      index: true
    }
  ],
  voters: [
    {
      type: Schema.ObjectId,
      ref: "Users",
      index: true
    }
  ],
  rememberers: [
    {
      type: Schema.ObjectId,
      ref: "Users",
      index: true
    }
  ],
  history: [PlunkHistorySchema],
  type: {
    type: String,
    'default': "plunk",
    'enum': "plunk template".split(" "),
    index: true
  },
  views: {
    type: Number,
    'default': 0
  },
  forked: {
    type: Number,
    'default': 0
  },
  frozen_version: {
    type: Number
  },
  frozen_at: {
    type: Date,
    'default': 0,
    index: true
  }
});

PlunkSchema.index({
  score: -1,
  updated_at: -1
});

PlunkSchema.index({
  thumbs: -1,
  updated_at: -1
});

PlunkSchema.index({
  views: -1,
  updated_at: -1
});

PlunkSchema.index({
  forked: -1,
  updated_at: -1
});

PlunkSchema.virtual("url").get(function() {
  return apiUrl + ("/plunks/" + this._id);
});

PlunkSchema.virtual("raw_url").get(function() {
  return runUrl + ("/plunks/" + this._id + "/");
});

PlunkSchema.virtual("comments_url").get(function() {
  return wwwUrl + ("/" + this._id + "/comments");
});

exports.PlunkSchema = PlunkSchema;
