var ApiError, createErrorClass, errDef, errorTypes, name,
    extend = function (child, parent) {
        for (var key in parent) {
            if (hasProp.call(parent, key)) child[key] = parent[key];
        } function ctor() {
            this.constructor = child;
        } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child;
    },
    hasProp = {}.hasOwnProperty;

exports.ApiError = ApiError = (function (superClass) {
    extend(ApiError, superClass);

    function ApiError() {
        return ApiError.__super__.constructor.apply(this, arguments);
    }

    return ApiError;

})(Error);

createErrorClass = function (name, classOptions) {
    if (classOptions == null) {
        classOptions = {};
    }
    classOptions.message || (classOptions.message = "Unknown error");
    classOptions.httpCode || (classOptions.httpCode = 500);
    classOptions.initialize || (classOptions.initialize = function (message, options) {
        var prop, results, val;
        if (options == null) {
            options = {};
        }
        if (message) {
            this.message = message;
        }
        results = [];
        for (prop in options) {
            val = options[prop];
            results.push(this[prop] = val);
        }
        return results;
    });
    classOptions.toJSON || (classOptions.toJSON = function () {
        return {
            error: this.message
        };
    });
    return (function (superClass) {
        var prop, val;

        extend(_Class, superClass);

        for (prop in classOptions) {
            val = classOptions[prop];
            _Class.prototype[prop] = val;
        }

        function _Class() {
            Error.call(this);
            Error.captureStackTrace(this, arguments.callee);
            this.name = name;
            this.initialize.apply(this, arguments);
        }

        return _Class;

    })(ApiError);
};

errorTypes = {
    ResourceExists: {
        httpCode: 400,
        message: "Resource exists"
    },
    DatabaseError: {
        httpCode: 400,
        message: "Database error",
        initialize: function (err) {
            return console.error("[ERR] " + this.message, err, err.stack);
        }
    },
    InvalidBody: {
        httpCode: 400,
        message: "Invalid payload",
        initialize: function (err) {
            return this.invalid = err.message;
        },
        toJSON: function () {
            return {
                message: this.message,
                invalid: this.invalid
            };
        }
    },
    NotFound: {
        message: "Not Found",
        httpCode: 404
    },
    PermissionDenied: {
        message: "Permission denied",
        httpCode: 404
    },
    ImpossibleError: {
        message: "Impossibru",
        initialize: function (err) {
            var Package, _, analytics, apiErrors, apiUrl, createLinksObject, gate, loadPackage, nconf, preparePackage, preparePackages, semver, users;

            nconf = require("nconf");

            analytics = require("analytics-node");

            users = require("./users");

            apiErrors = require("../errors");

            gate = require("json-gate");

            semver = require("semver");

            _ = require("underscore")._;

            Package = require("../database").Package;

            apiUrl = nconf.get("url:api");

            exports.schema = {
                create: gate.createSchema(require("./schema/packages/create.json")),
                update: gate.createSchema(require("./schema/packages/update.json")),
                versions: {
                    create: gate.createSchema(require("./schema/packages/versions/create.json")),
                    update: gate.createSchema(require("./schema/packages/versions/update.json"))
                }
            };

            createLinksObject = function (baseUrl, page, pages, limit) {
                var links;
                links = {};
                if (page < pages) {
                    links.next = baseUrl + "?p=" + (page + 1) + "&pp=" + limit;
                    links.last = baseUrl + "?p=" + pages + "&pp=" + limit;
                }
                if (page > 1) {
                    links.prev = baseUrl + "?p=" + (page - 1) + "&pp=" + limit;
                    links.first = baseUrl + "?p=1&pp=" + limit;
                }
                return links;
            };

            preparePackage = function (pkg, json, options) {
                var ref, ref1;
                if ('function' === typeof pkg.ownerDocument) {
                    return json;
                }
                if ((ref = options.session) != null ? (ref1 = ref.user) != null ? ref1.login : void 0 : void 0) {
                    json.maintainer = true;
                }
                delete json._id;
                delete json.__v;
                return json;
            };

            preparePackages = function (session, pkgs) {
                return _.map(pkgs, function (pkg) {
                    return pkg.toJSON({
                        session: session,
                        transform: preparePackage,
                        virtuals: true,
                        getters: true
                    });
                });
            };

            module.exports.loadPackage = loadPackage = function (query, cb) {
                if (!query) {
                    return cb();
                }
                return Package.findOne(query).exec(function (err, pkg) {
                    if (err) {
                        return cb(err);
                    } else if (!pkg) {
                        return cb();
                    } else {
                        return cb(null, pkg);
                    }
                });
            };

            module.exports.withPackage = function (req, res, next) {
                return loadPackage({
                    name: req.params.name
                }, function (err, pkg) {
                    if (err) {
                        return next(new apiErrors.DatabaseError(err));
                    } else if (!pkg) {
                        return next(new apiErrors.NotFound);
                    } else {
                        req.pkg = pkg;
                        return next();
                    }
                });
            };

            module.exports.withOwnPackage = function (req, res, next) {
                console.log("withOwnPackage", req.currentUser != null);
                if (!req.currentUser) {
                    return next(new apiErrors.NotFound);
                }
                return loadPackage({
                    name: req.params.name,
                    maintainers: req.currentUser.login
                }, function (err, pkg) {
                    if (err) {
                        return next(new apiErrors.DatabaseError(err));
                    } else if (!pkg) {
                        return next(new apiErrors.NotFound);
                    } else {
                        req.pkg = pkg;
                        return next();
                    }
                });
            };

            exports.createListing = function (config) {
                if (config == null) {
                    config = {};
                }
                return function (req, res, next) {
                    var limit, options, page, query;
                    options = _.isFunction(config) ? options = config(req, res) : angular.copy(config);
                    options.baseUrl || (options.baseUrl = apiUrl + "/catalogue/packages");
                    options.query || (options.query = {});
                    page = parseInt(req.param("p", "1"), 10);
                    limit = parseInt(req.param("pp", "8"), 10);
                    query = Package.find(options.query);
                    query.sort(options.sort || {
                        bumps: -1
                    });
                    return query.paginate(page, limit, function (err, packages, count, pages, current) {
                        if (err) {
                            return next(new apiErrors.DatabaseError(err));
                        } else {
                            res.links(createLinksObject(options.baseUrl, current, pages, limit));
                            return res.json(preparePackages(req.currentSession, packages));
                        }
                    });
                };
            };

            exports.create = function (req, res, next) {
                var pkg, ref;
                pkg = new Package(req.body);
                if ((ref = req.currentUser) != null ? ref.login : void 0) {
                    pkg.maintainers.push(req.currentUser.login);
                }
                return pkg.save(function (err, pkg) {
                    var json;
                    if (err) {
                        if (err.code === 11000) {
                            return next(new apiErrors.ResourceExists);
                        } else {
                            return next(new apiErrors.DatabaseError(err));
                        }
                    } else {
                        json = pkg.toJSON({
                            session: req.currentSession,
                            transform: preparePackage,
                            virtuals: true,
                            getters: true
                        });
                        return res.json(201, json);
                    }
                });
            };

            exports.read = function (req, res, next) {
                var json;
                if (req.param("bump")) {
                    req.pkg.update({
                        $inc: {
                            bumps: 1
                        }
                    });
                    req.pkg.bumps++;
                }
                json = req.pkg.toJSON({
                    session: req.currentSession,
                    transform: preparePackage,
                    virtuals: true,
                    getters: true
                });
                return res.json(json);
            };

            exports.update = function (req, res, next) {
                return req.pkg.set(req.body).save(function (err, pkg) {
                    var json;
                    if (err) {
                        return next(new apiErrors.DatabaseError(err));
                    } else {
                        json = pkg.toJSON({
                            session: req.currentSession,
                            transform: preparePackage,
                            virtuals: true,
                            getters: true
                        });
                        return res.json(json);
                    }
                });
            };

            exports.bump = function (req, res, next) {
                var json;
                req.pkg.bumps++;
                json = req.pkg.toJSON({
                    session: req.currentSession,
                    transform: preparePackage,
                    virtuals: true,
                    getters: true
                });
                res.json(json);
                return req.pkg.update({
                    $inc: {
                        bumps: 1
                    }
                }).exec();
            };

            exports.destroy = function (req, res, next) {
                return req.pkg.remove(function (err) {
                    if (err) {
                        return next(new apiErrors.DatabaseError(err));
                    } else {
                        return res.send(204);
                    }
                });
            };

            exports.addMaintainer = function (req, res, next) {
                req.pkg.maintainers.push(req.body.login);
                return req.pkg.save(function (err, pkg) {
                    var json;
                    if (err) {
                        return next(new apiErrors.DatabaseError(err));
                    } else {
                        json = pkg.toJSON({
                            session: req.currentSession,
                            transform: preparePackage,
                            virtuals: true,
                            getters: true
                        });
                        return res.json(201, json);
                    }
                });
            };

            exports.removeMaintainer = function (req, res, next) {
                req.pkg.maintainers.pull(req.body.login);
                return req.pkg.save(function (err, pkg) {
                    var json;
                    if (err) {
                        return next(new apiErrors.DatabaseError(err));
                    } else {
                        json = pkg.toJSON({
                            session: req.currentSession,
                            transform: preparePackage,
                            virtuals: true,
                            getters: true
                        });
                        return res.json(200, json);
                    }
                });
            };

            exports.versions = {};

            exports.versions.create = function (req, res, next) {
                req.pkg.versions.push(req.body);
                return req.pkg.save(function (err, pkg) {
                    var json;
                    if (err) {
                        return next(new apiErrors.DatabaseError(err));
                    } else {
                        json = pkg.toJSON({
                            session: req.currentSession,
                            transform: preparePackage,
                            virtuals: true,
                            getters: true
                        });
                        return res.json(201, json);
                    }
                });
            };

            exports.versions.update = function (req, res, next) {
                var version;
                version = _.find(req.pkg.versions, function (ver) {
                    return ver.semver === req.params.semver;
                });
                if (!version) {
                    return next(new apiErrors.NotFound);
                }
                _.extend(version, req.body);
                return req.pkg.save(function (err, pkg) {
                    var json;
                    if (err) {
                        return next(new apiErrors.DatabaseError(err));
                    } else {
                        json = pkg.toJSON({
                            session: req.currentSession,
                            transform: preparePackage,
                            virtuals: true,
                            getters: true
                        });
                        return res.json(200, json);
                    }
                });
            };

            exports.versions.destroy = function (req, res, next) {
                var version;
                version = _.find(req.pkg.versions, function (ver) {
                    return ver.semver === req.params.semver;
                });
                if (!version) {
                    return next(new apiErrors.NotFound);
                }
                req.pkg.versions.remove(version);
                return req.pkg.save(function (err, pkg) {
                    var json;
                    if (err) {
                        return next(new apiErrors.DatabaseError(err));
                    } else {
                        json = pkg.toJSON({
                            session: req.currentSession,
                            transform: preparePackage,
                            virtuals: true,
                            getters: true
                        });
                        return res.json(200, json);
                    }
                });
            };
            return console.error("[ERR] " + this.message, err);
        }
    }
};

for (name in errorTypes) {
    errDef = errorTypes[name];
    exports[name] = createErrorClass(name, errDef);
}
