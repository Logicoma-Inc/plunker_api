var Query, memoize, mongoose;

mongoose = require("mongoose");

memoize = require("memoize");

Query = mongoose.Query;

Query.prototype.paginate = function(page, limit, cb) {
  var countRecords, query;
  page = Math.max(1, parseInt(page, 10));
  limit = Math.max(4, Math.min(12, parseInt(limit, 10)));
  query = this;
  countRecords = memoize(this.model.count.bind(this.model), {
    expire: 1000 * 60
  });
  return query.skip(page * limit - limit).limit(limit).exec(function(err, docs) {
    if (err) {
      return cb(err, null, null);
    }
    return countRecords(query._conditions, function(err, count) {
      if (err) {
        return cb(err, null, null);
      }
      return cb(null, docs, count, Math.ceil(count / limit), page);
    });
  });
};
