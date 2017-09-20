var Document, Mixed, ObjectId, Query, Schema, SessionSchema, TokenSchema, apiUrl, genid, mongoose, nconf, ref;

mongoose = require("mongoose");

nconf = require("nconf");

genid = require("genid");

apiUrl = nconf.get("url:api");

Schema = mongoose.Schema, Document = mongoose.Document, Query = mongoose.Query;

ref = Schema.Types, ObjectId = ref.ObjectId, Mixed = ref.Mixed;

TokenSchema = new Schema({
  _id: {
    type: String,
    ref: "Plunk"
  },
  token: {
    type: String
  }
});

SessionSchema = new Schema({
  user: {
    type: Schema.ObjectId,
    ref: "User"
  },
  user_info: {},
  last_access: {
    type: Date,
    index: true,
    'default': Date.now
  },
  public_id: {
    type: String,
    'default': genid
  },
  auth: {},
  keychain: [TokenSchema]
});

SessionSchema.virtual("url").get(function() {
  return apiUrl + ("/sessions/" + this._id);
});

SessionSchema.virtual("user_url").get(function() {
  return apiUrl + ("/sessions/" + this._id + "/user");
});

SessionSchema.virtual("age").get(function() {
  return Date.now() - this.last_access;
});

SessionSchema.set("toJSON", {
  virtuals: true,
  getters: true,
  transform: function(session, json, options) {
    json.id = json._id;
    if (json.user_info) {
      json.user = json.user_info;
    }
    delete json.user_info;
    delete json._id;
    delete json.__v;
    return json;
  }
});

exports.SessionSchema = SessionSchema;
