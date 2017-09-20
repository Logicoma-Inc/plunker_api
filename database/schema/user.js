var Document, Mixed, ObjectId, Query, Schema, UserSchema, mongoose, ref;

mongoose = require("mongoose");

Schema = mongoose.Schema, Document = mongoose.Document, Query = mongoose.Query;

ref = Schema.Types, ObjectId = ref.ObjectId, Mixed = ref.Mixed;

exports.UserSchema = UserSchema = new Schema({
  login: {
    type: String,
    index: true
  },
  gravatar_id: String,
  service_id: {
    type: String,
    index: {
      unique: true
    }
  }
});

UserSchema.virtual("created_at").get(function() {
  return new Date(parseInt(this._id.toString().substring(0, 8), 16) * 1000);
});

UserSchema.set("toJSON", {
  virtuals: true,
  transform: function(user, json, options) {
    json.id = json._id;
    delete json._id;
    delete json.__v;
    delete json.service_id;
    return json;
  }
});
