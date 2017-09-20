var LRU, Plunk, _, analytics, apiErrors, apiUrl, applyFilesDeltaToPlunk, applyTagsDeltaToPlunk, calculateScore, calculateScoreDelta, createEvent, createLinksObject, database, diff_match_patch, dmp, gate, gdiff, genid, loadPlunk, nconf, ownsPlunk, populatePlunk, preparePlunk, preparePlunks, revertTo, saveNewPlunk, verCache;

_ = require("lodash");

nconf = require("nconf");

genid = require("genid");

diff_match_patch = require("googlediff");

gate = require("json-gate");

analytics = require("analytics-node");

LRU = require("lru-cache");

gdiff = new diff_match_patch();

apiErrors = require("../errors");

apiUrl = nconf.get('url:api');

database = require("../database");

Plunk = database.Plunk;

exports.schema = {
    create: gate.createSchema(require("./schema/plunks/create.json")),
    fork: gate.createSchema(require("./schema/plunks/fork.json")),
    update: gate.createSchema(require("./schema/plunks/update.json"))
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

createEvent = function (type, user) {
    var event;
    event = {
        event: type || "create",
        changes: []
    };
    if (user) {
        event.user = user._id;
    }
    return event;
};

dmp = new diff_match_patch();

verCache = LRU(128);

revertTo = function (current, version, cb) {
    var cached, chg, e, i, j, k, l, len, patch, ref, ref1, ref2, rel, remove, rename, size;
    if (!((ref = current.history) != null ? ref.length : void 0)) {
        return current;
    }
    if (version >= current.history.length) {
        return current;
    }
    if (!current.token && (cached = verCache.get(current.id + "/" + version))) {
        return cached;
    }
    size = (current.history.length || 1) - 1;
    rel = size - version;
    rename = function (fn, to) {
        var file;
        if (file = current.files[fn]) {
            file.filename = to;
            delete current.files[fn];
            return current.files[to] = file;
        }
    };
    patch = function (fn, patches) {
        var file, ref1;
        if (file = current.files[fn]) {
            return ref1 = dmp.patch_apply(patches, file.content), file.content = ref1[0], ref1;
        }
    };
    remove = function (fn) {
        return delete current.files[fn];
    };
    try {
        for (i = k = 0, ref1 = rel; 0 <= ref1 ? k < ref1 : k > ref1; i = 0 <= ref1 ? ++k : --k) {
            ref2 = current.history[size - i].changes;
            for (j = l = 0, len = ref2.length; l < len; j = ++l) {
                chg = ref2[j];
                if (chg.pn) {
                    if (chg.fn) {
                        if (chg.pl) {
                            patch(chg.fn, dmp.patch_fromText(chg.pl));
                        }
                        if (chg.pn !== chg.fn) {
                            rename(chg.fn, chg.pn);
                        }
                    } else {
                        current.files[chg.pn] = {
                            filename: chg.pn,
                            content: chg.pl
                        };
                    }
                } else if (chg.fn) {
                    remove(chg.fn);
                }
            }
        }
    } catch (_error) {
        e = _error;
        console.trace("[ERR] Failed to revert " + current.id + " to version " + version + ":", e);
    }
    current.currentVersion = version;
    if (!current.token) {
        verCache.set(current.id + "/" + version, current);
    }
    return current;
};

ownsPlunk = function (session, json) {
    var owner, ref;
    owner = false;
    if (session) {
        owner || (owner = !!(json.user && session.user && json.user === session.user._id));
        owner || (owner = !!(json.user && session.user && json.user.login === session.user.login));
        owner || (owner = !!(session.keychain && ((ref = session.keychain.id(json.id)) != null ? ref.token : void 0) === json.token));
    }
    return owner;
};

saveNewPlunk = function (plunk, cb) {
    var savePlunk;
    savePlunk = function () {
        plunk._id = !!plunk["private"] ? genid(20) : genid(6);
        return plunk.save(function (err) {
            if (err) {
                if (err.code === 11000) {
                    return savePlunk();
                } else {
                    console.error("[ERR]", err.message, err);
                    return cb(new apiErrors.DatabaseError(err));
                }
            } else {
                return cb(null, plunk);
            }
        });
    };
    return savePlunk();
};

populatePlunk = function (json, options) {
    var file, filename, k, len, plunk, ref, ref1, ref2, tag;
    if (options == null) {
        options = {};
    }
    plunk = options.plunk || new Plunk;
    plunk.description = json.description || "Untitled";
    plunk["private"] = json["private"] !== false;
    plunk.source = json.source;
    if (options.user) {
        plunk.user = options.user._id;
    }
    if (options.parent) {
        plunk.fork_of = options.parent._id;
    }
    if (!options.skipTags) {
        ref = json.tags;
        for (k = 0, len = ref.length; k < len; k++) {
            tag = ref[k];
            plunk.tags.push(tag);
        }
    }
    plunk.type = (ref1 = options.type) === "plunk" || ref1 === "template" ? options.type : "plunk";
    if (!options.skipFiles) {
        ref2 = json.files;
        for (filename in ref2) {
            file = ref2[filename];
            plunk.files.push({
                filename: file.filename || filename,
                content: file.content
            });
        }
    }
    return plunk;
};

preparePlunk = function (plunk, json, options) {
    var corrected, delta, ref, ref1, ref2, ref3, ref4, ref5, was;
    if ('function' === typeof plunk.ownerDocument) {
        return json;
    }
    corrected = false;
    if ((was = (ref = plunk.voters) != null ? ref.length : void 0) !== plunk.thumbs) {
        console.log("[INFO] Correcting thumbs for " + plunk.id + " from " + plunk.thumbs + " to " + plunk.voters.length);
        plunk.thumbs = plunk.voters.length;
        corrected = true;
    }
    if ((was = (ref1 = plunk.forks) != null ? ref1.length : void 0) !== plunk.forked) {
        console.log("[INFO] Correcting forks for " + plunk.id + " from " + was + " to " + plunk.forks.length);
        plunk.forked = plunk.forks.length;
        corrected = true;
    }
    if ((was = plunk.score) && plunk.score !== plunk.created_at.valueOf() + calculateScore(plunk.thumbs)) {
        delta = calculateScore(plunk.thumbs);
        console.log("[INFO] Correcting score for " + plunk.id + " from " + was + " to " + (delta / (1000 * 60 * 60)));
        plunk.score = json.score = plunk.created_at.valueOf() + delta;
        corrected = true;
    }
    if (corrected) {
        plunk.save();
    }
    if (!ownsPlunk(options.session, plunk)) {
        delete json.token;
    }
    delete json.voters;
    delete json.rememberers;
    delete json._id;
    delete json.__v;
    if (json.files) {
        json.files = (function () {
            var file, files, k, len, ref2;
            files = {};
            ref2 = json.files;
            for (k = 0, len = ref2.length; k < len; k++) {
                file = ref2[k];
                file.raw_url = "" + json.raw_url + file.filename;
                files[file.filename] = file;
            }
            return files;
        })();
    }
    if (!json.token && json.frozen_at && json.history) {
        if (json.frozen_version == null) {
            json.frozen_version = json.history.length - 1;
        }
        json = revertTo(json, json.frozen_version);
        if (json.history) {
            json.history = json.history.slice(0, json.frozen_version + 1);
        }
    }
    json.thumbed = (((ref2 = options.session) != null ? ref2.user : void 0) != null) && ((ref3 = plunk.voters) != null ? ref3.indexOf("" + options.session.user._id) : void 0) >= 0;
    json.remembered = (((ref4 = options.session) != null ? ref4.user : void 0) != null) && ((ref5 = plunk.rememberers) != null ? ref5.indexOf("" + options.session.user._id) : void 0) >= 0;
    if (options.user) {
        json.user = options.user.toJSON();
    }
    return json;
};

preparePlunks = function (session, plunks) {
    return _.map(plunks, function (plunk) {
        return plunk.toJSON({
            session: session,
            transform: preparePlunk,
            virtuals: true,
            getters: true
        });
    });
};

applyFilesDeltaToPlunk = function (plunk, json) {
    var changes, chg, file, filename, index, k, len, old, oldFiles, ref, ref1;
    oldFiles = {};
    changes = [];
    if (!json.files) {
        return changes;
    }
    ref = plunk.files;
    for (index = k = 0, len = ref.length; k < len; index = ++k) {
        file = ref[index];
        oldFiles[file.filename] = file;
    }
    ref1 = json.files;
    for (filename in ref1) {
        file = ref1[filename];
        if (file === null) {
            if (old = oldFiles[filename]) {
                changes.push({
                    pn: filename,
                    pl: old.content
                });
                if (old.remove != null) {
                    oldFiles[filename].remove();
                } else {
                    delete oldFiles[filename];
                }
            }
        } else if (old = oldFiles[filename]) {
            chg = {
                pn: old.filename,
                fn: file.filename || old.filename
            };
            if (file.filename) {
                old.filename = file.filename;
            }
            if (file.content != null) {
                chg.pl = gdiff.patch_toText(gdiff.patch_make(file.content, old.content));
                old.content = file.content;
            }
            if (chg.fn || file.filename) {
                changes.push(chg);
            }
        } else if (file.content) {
            changes.push({
                fn: filename,
                pl: file.content
            });
            plunk.files.push({
                filename: filename,
                content: file.content
            });
        }
    }
    return changes;
};

applyTagsDeltaToPlunk = function (plunk, json) {
    var add, changes, idx, ref, tagname;
    changes = [];
    if (json.tags) {
        plunk.tags || (plunk.tags = []);
        ref = json.tags;
        for (tagname in ref) {
            add = ref[tagname];
            if (add) {
                if ((idx = plunk.tags.indexOf(tagname)) < 0) {
                    plunk.tags.push(tagname);
                }
            } else {
                if ((idx = plunk.tags.indexOf(tagname)) >= 0) {
                    plunk.tags.splice(idx, 1);
                }
            }
        }
    }
    return changes;
};

exports.loadPlunk = loadPlunk = function (id, cb) {
    if (!(id && id.length)) {
        return cb();
    }
    Plunk.findById(id).populate("user", 'gravatar_id login service_id').populate("history.user", 'gravatar_id login service_id').exec(function (err, plunk) {
        var changed, dups, idx, seen, tagname;
        changed = false;
        if ((plunk != null ? plunk.tags : void 0) && _.uniq(plunk.tags).length !== plunk.tags.length) {
            seen = [];
            dups = [];
            idx = plunk.tags.length - 1;
            while (idx >= 0) {
                tagname = plunk.tags[idx];
                if (!(0 > seen.indexOf(tagname))) {
                    dups.push(tagname);
                    plunk.tags.splice(idx, 1);
                } else {
                    seen.push(tagname);
                }
                idx--;
            }
            changed || (changed = dups.length > 0);
            if (dups.length) {
                console.log("[INFO] Removing duplicate tags: " + (dups.join(', ')) + " for " + id);
            }
        }
        if (changed) {
            return plunk.save(function (err) {
                if (!err) {
                    console.log("[OK] Duplicate tags removed");
                }
                return cb(err, plunk);
            });
        }
        if (err) {
            return cb(err);
        } else if (!plunk) {
            return cb();
        } else {
            return cb(null, plunk);
        }
    });
};

exports.withPlunk = function (req, res, next) {
    loadPlunk(req.params.id, function (err, plunk) {
        if (err) {
            return next(new apiErrors.DatabaseError(err));
        } else if (!plunk) {
            return next(new apiErrors.NotFound);
        } else {
            req.plunk = plunk;
            return next();
        }
    });
};

exports.ownsPlunk = function (req, res, next) {
    if (!ownsPlunk(req.currentSession, req.plunk)) {
        next(new apiErrors.NotFound);
    } else {
        next();
    }
};

exports.createListing = function (config) {
    if (config == null) {
        config = {};
    }
    return function (req, res, next) {
        var limit, options, page, query;
        if (_.isFunction(config)) {
            options = config(req, res);
        }
        options || (options = {});
        options.baseUrl || (options.baseUrl = apiUrl + "/plunks");
        options.query || (options.query = {});
        page = parseInt(req.param("p", "1"), 10);
        limit = parseInt(req.param("pp", "8"), 10);
        if (!options.ignorePrivate) {
            if (req.currentUser) {
                options.query.$or = [
                    {
                        'private': false
                    }, {
                        user: req.currentUser._id
                    }
                ];
            } else {
                options.query["private"] = false;
            }
        } else if (options.onlyPublic) {
            options.query["private"] = false;
        }
        query = Plunk.find(options.query);
        query.sort(options.sort || "-updated_at");
        if (req.param("files") !== "yes") {
            query.select("-files");
        }
        if (req.param("file.contents") === "no") {
            query.select("-files.content");
        }
        query.select("-history");
        query.populate("user", 'gravatar_id login service_id').paginate(page, limit, function (err, plunks, count, pages, current) {
            if (err) {
                next(new apiErrors.DatabaseError(err));
            } else {
                res.links(createLinksObject(options.baseUrl, current, pages, limit));
                res.json(preparePlunks(req.currentSession, plunks));
            }
            return options = page = limit = null;
        });
    };
};

exports.read = function (req, res, next) {
    loadPlunk(req.params.id, function (err, plunk) {
        var json;
        if (err) {
            return next(new apiErrors.DatabaseError(err));
        } else if (!plunk) {
            return next(new apiErrors.NotFound);
        } else if (plunk) {
            if (!req.param("nv")) {
                plunk.views++;
                plunk.save();
            }
            json = plunk.toJSON({
                session: req.currentSession,
                transform: preparePlunk,
                virtuals: true,
                getters: true
            });
            if (req.param("v")) {
                json = revertTo(json, parseInt(req.param("v"), 10));
            }
            return res.json(json);
        }
    });
};

exports.create = function (req, res, next) {
    var event, plunk;
    event = createEvent("create", req.currentUser);
    plunk = populatePlunk(req.body, {
        user: req.currentUser
    });
    plunk.history.push(event);
    if (!req.currentUser && !plunk["private"]) {
        return next(new apiErrors.NotFound);
    }
    saveNewPlunk(plunk, function (err, plunk) {
        var json;
        if (err) {
            return next(new apiErrors.DatabaseError(err));
        } else {
            if (!req.currentUser && req.currentSession && req.currentSession.keychain) {
                req.currentSession.keychain.push({
                    _id: plunk._id,
                    token: plunk.token
                });
                req.currentSession.save();
            }
            json = plunk.toJSON({
                session: req.currentSession,
                transform: preparePlunk,
                virtuals: true,
                getters: true
            });
            if (req.currentUser) {
                json.user = req.currentUser.toJSON();
            }
            if (req.currentUser) {
                json.history[json.history.length - 1].user = req.currentUser.toJSON();
            }
            return res.json(201, json);
        }
    });
};

exports.update = function (req, res, next) {
    var e, event, k, l, len, len1, ref, ref1;
    if (!req.plunk) {
        return next(new Error("request.plunk is required for update()"));
    }
    event = createEvent("update", req.currentUser);
    ref = applyFilesDeltaToPlunk(req.plunk, req.body);
    for (k = 0, len = ref.length; k < len; k++) {
        e = ref[k];
        event.changes.push(e);
    }
    ref1 = applyTagsDeltaToPlunk(req.plunk, req.body);
    for (l = 0, len1 = ref1.length; l < len1; l++) {
        e = ref1[l];
        event.changes.push(e);
    }
    req.plunk.updated_at = new Date;
    if (req.body.description) {
        req.plunk.description = req.body.description;
    }
    if (req.currentUser) {
        req.plunk.user = req.currentUser._id;
    }
    req.plunk.history.push(event);
    req.plunk.save(function (err, plunk) {
        var json;
        if (err) {
            return next(new apiErrors.DatabaseError(err));
        } else {
            json = plunk.toJSON({
                user: req.currentUser,
                session: req.currentSession,
                transform: preparePlunk,
                virtuals: true,
                getters: true
            });
            if (req.currentUser) {
                json.history[json.history.length - 1].user = req.currentUser.toJSON();
            }
            return res.json(json);
        }
    });
};

exports.freeze = function (req, res, next) {
    var json;
    if (!req.plunk) {
        return next(new Error("request.plunk is required for freeze()"));
    }
    json = req.plunk.toJSON({
        user: req.currentUser,
        session: req.currentSession,
        transform: preparePlunk,
        virtuals: true,
        getters: true
    });
    if (req.param("v")) {
        json = revertTo(json, parseInt(req.param("v"), 10));
    }
    req.plunk.frozen_at = new Date;
    req.plunk.frozen_version = req.param("v") ? parseInt(req.param("v"), 10) : req.plunk.history.length - 1;
    return req.plunk.save(function (err, plunk) {
        json = plunk.toJSON({
            session: req.currentSession,
            transform: preparePlunk,
            virtuals: true,
            getters: true
        });
        if (err) {
            return next(new apiErrors.DatabaseError(err));
        } else {
            return res.send(200, json);
        }
    });
};

exports.unfreeze = function (req, res, next) {
    if (!req.plunk) {
        return next(new Error("request.plunk is required for freeze()"));
    }
    req.plunk.frozen_at = void 0;
    req.plunk.frozen_version = void 0;
    return req.plunk.save(function (err, plunk) {
        var json;
        json = plunk.toJSON({
            session: req.currentSession,
            transform: preparePlunk,
            virtuals: true,
            getters: true
        });
        if (err) {
            return next(new apiErrors.DatabaseError(err));
        } else {
            return res.send(200, json);
        }
    });
};

exports.fork = function (req, res, next) {
    var e, event, evt, fork, json, k, l, len, len1, len2, m, ref, ref1, ref2;
    if (!req.plunk) {
        return next(new Error("request.plunk is required for update()"));
    }
    if (!req.currentUser) {
        req.body["private"] = true;
    }
    event = createEvent("fork", req.currentUser);
    if (req.apiVersion === 1) {
        json = req.plunk.toJSON();
        if (req.body.description) {
            json.description = req.body.description;
        }
        if (req.body["private"] != null) {
            json["private"] = req.body["private"];
        }
        ref = applyFilesDeltaToPlunk(json, req.body);
        for (k = 0, len = ref.length; k < len; k++) {
            e = ref[k];
            event.changes.push(e);
        }
        ref1 = applyTagsDeltaToPlunk(json, req.body);
        for (l = 0, len1 = ref1.length; l < len1; l++) {
            e = ref1[l];
            event.changes.push(e);
        }
    } else if (req.apiVersion === 0) {
        json = req.body;
    }
    fork = populatePlunk(json, {
        user: req.currentUser,
        parent: req.plunk
    });
    ref2 = req.plunk.history;
    for (m = 0, len2 = ref2.length; m < len2; m++) {
        evt = ref2[m];
        fork.history.push(evt);
    }
    fork.history.push(event);
    saveNewPlunk(fork, function (err, plunk) {
        if (err) {
            return next(new apiErrors.DatabaseError(err));
        } else {
            if (!req.currentUser && req.currentSession && req.currentSession.keychain) {
                req.currentSession.keychain.push({
                    _id: plunk._id,
                    token: plunk.token
                });
                req.currentSession.save();
            }
            json = plunk.toJSON({
                session: req.currentSession,
                transform: preparePlunk,
                virtuals: true,
                getters: true
            });
            if (req.currentUser) {
                json.user = req.currentUser.toJSON();
            }
            if (req.currentUser) {
                json.history[json.history.length - 1].user = req.currentUser.toJSON();
            }
            res.json(201, json);
            req.plunk.forks.push(plunk._id);
            req.plunk.forked++;
            return req.plunk.save();
        }
    });
};

exports.destroy = function (req, res, next) {
    if (!req.plunk) {
        return next(new Error("request.plunk is required for update()"));
    }
    if (req.plunk.fork_of) {
        loadPlunk(req.plunk.fork_of, function (err, parent) {
            if (parent) {
                parent.forks.remove(req.plunk.fork_of);
                parent.forked--;
                return parent.save();
            }
        });
    }
    if (!ownsPlunk(req.currentSession, req.plunk)) {
        next(new apiErrors.NotFound);
    } else {
        req.plunk.remove(function () {
            return res.send(204);
        });
    }
};

calculateScore = function (count) {
    var score;
    if (count == null) {
        count = 0;
    }
    score = 0;
    while (count > 0) {
        score += calculateScoreDelta(count - 1);
        count--;
    }
    return score;
};

calculateScoreDelta = function (count) {
    var baseIncrement, decayFactor;
    if (count == null) {
        count = 0;
    }
    baseIncrement = 1000 * 60 * 60 * 12;
    decayFactor = 1.2;
    return baseIncrement / Math.pow(decayFactor, count);
};

exports.setThumbed = function (req, res, next) {
    var base, base1;
    if (!req.currentUser) {
        return next(new apiErrors.PermissionDenied);
    }
    if (!(0 > req.plunk.voters.indexOf(req.currentUser._id))) {
        return next(new apiErrors.NotFound);
    }
    (base = req.plunk).score || (base.score = req.plunk.created_at.valueOf());
    (base1 = req.plunk).thumbs || (base1.thumbs = 0);
    req.plunk.voters.addToSet(req.currentUser._id);
    req.plunk.score += calculateScoreDelta(req.plunk.thumbs);
    req.plunk.thumbs++;
    return req.plunk.save(function (err, plunk) {
        if (err) {
            return next(new apiErrors.DatabaseError(err));
        } else {
            return res.json({
                thumbs: plunk.get("thumbs"),
                score: plunk.score
            }, 201);
        }
    });
};

exports.unsetThumbed = function (req, res, next) {
    if (!req.currentUser) {
        return next(new apiErrors.PermissionDenied);
    }
    if (0 > req.plunk.voters.indexOf(req.currentUser._id)) {
        return next(new apiErrors.NotFound);
    }
    if (!(0 > req.plunk.voters.indexOf(req.currentUser._id))) {
        req.plunk.voters.remove(req.currentUser._id);
        req.plunk.score -= calculateScoreDelta(req.plunk.thumbs - 1);
        req.plunk.thumbs--;
    }
    return req.plunk.save(function (err, plunk) {
        if (err) {
            return next(new apiErrors.DatabaseError(err));
        } else {
            return res.json({
                thumbs: plunk.get("thumbs"),
                score: plunk.score
            }, 200);
        }
    });
};

exports.setRemembered = function (req, res, next) {
    if (!req.currentUser) {
        return next(new apiErrors.PermissionDenied);
    }
    req.plunk.rememberers.addToSet(req.currentUser._id);
    return req.plunk.save(function (err, plunk) {
        if (err) {
            return next(new apiErrors.DatabaseError(err));
        } else {
            return res.json({
                status: "OK"
            }, 201);
        }
    });
};

exports.unsetRemembered = function (req, res, next) {
    if (!req.currentUser) {
        return next(new apiErrors.PermissionDenied);
    }
    req.plunk.rememberers.remove(req.currentUser._id);
    return req.plunk.save(function (err, plunk) {
        if (err) {
            return next(new apiErrors.DatabaseError(err));
        } else {
            return res.json({
                status: "OK"
            }, 200);
        }
    });
};
