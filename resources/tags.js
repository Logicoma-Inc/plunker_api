var LRU, Plunk, _, apiErrors, apiUrl, cache, database, nconf, plunks;

_ = require("underscore")._;

nconf = require("nconf");

LRU = require("lru-cache");

plunks = require("./plunks");

apiErrors = require("../errors");

apiUrl = nconf.get('url:api');

database = require("../database");

cache = LRU({
  max: 200,
  maxAge: 1000 * 60 * 60 * 24
});

Plunk = database.Plunk;

exports.list = function(req, res, next) {
  var pipeline, q;
  pipeline = [];
  pipeline.push({
    $unwind: "$tags"
  });
  pipeline.push({
    $group: {
      _id: {
        $toLower: "$tags"
      },
      count: {
        $sum: 1
      }
    }
  });
  if (q = req.param("q")) {
    pipeline.push({
      $match: {
        _id: {
          $regex: "^" + q,
          $options: "i"
        }
      }
    });
  }
  pipeline.push({
    $sort: {
      count: -1
    }
  });
  pipeline.push({
    $limit: 10
  });
  return Plunk.aggregate(pipeline, function(err, results) {
    if (err) {
      return next(err);
    }
    return res.json(_.map(results, function(record) {
      return {
        tag: record._id,
        count: record.count
      };
    }));
  });
};
