var PRUNE_FREQUENCY, Session, apiErrors, apiUrl, app, appengine, cors, corsOptions, errorHandler, express, forkSchema, morgan, nconf, packages, plunks, protocolRelativeUrl, pruneSessions, sessions, tags, users, validateSchema, wwwUrl;
appengine = require('appengine');
express = require("express");
morgan = require("morgan");
nconf = require("nconf");
cors = require("cors");

require("./configure");

validateSchema = require("./middleware/schema");

apiErrors = require("./errors");

app = module.exports = express();

apiUrl = nconf.get("url:api");

wwwUrl = nconf.get("url:www");

Session = require("./database").Session;

errorHandler = function (err, req, res, next) {
    if (err instanceof apiErrors.ApiError) {
        res.json(err.httpCode, err.toJSON());
        return console.log("[ERR]", err.toJSON());
    } else {
        return next(err);
    }
};

corsOptions = {
    origin: true,
    exposeHeaders: "Link",
    maxAge: 60
};

app.set("jsonp callback", true);

app.use(appengine.middleware.base);

app.use(morgan("short"));

app.use(require("./middleware/cors").middleware());

app.use(express.bodyParser());

app.use(require("./middleware/version").middleware());

app.use(require("./middleware/nocache").middleware());

app.use(require("./middleware/session").middleware({
    sessions: Session
}));

app.use(app.router);

app.use(errorHandler);

app.use(express.errorHandler());

sessions = require("./resources/sessions");

users = require("./resources/users");

app.get("/_ah/start", function (req, res) {
    return res.send(200, "OK");
});

app.get("/_ah/stop", function (req, res) {
    res.send(200, "OK");
    return process.exit(0);
});

app.get("/_ah/health", function (req, res) {
    return res.send(200, "OK");
});

protocolRelativeUrl = wwwUrl.replace(/^https?:/, '');

app.get("/proxy.html", function (req, res) {
    return res.send("<!DOCTYPE HTML>\n<script src=\"https://cdn.rawgit.com/jpillora/xdomain/0.7.3/dist/xdomain.min.js\"></script>\n<script>\n  xdomain.masters({\n    \"http:" + protocolRelativeUrl + "\": \"*\",\n    \"https:" + protocolRelativeUrl + "\": \"*\"\n  });\n</script>");
});

app.get("/sessions", sessions.findOrCreate);

app.post("/sessions", sessions.create);

app.get("/sessions/:id", sessions.read);

app.post("/sessions/:id/user", sessions.withSession, sessions.setUser);

app.del("/sessions/:id/user", sessions.withSession, sessions.unsetUser);

app.put("*", sessions.withCurrentSession);

app.post("*", sessions.withCurrentSession);

plunks = require("./resources/plunks");

app.get("/plunks", plunks.createListing(function (req, res) {
    return {
        baseUrl: apiUrl + "/plunks",
        sort: "-updated_at",
        ignorePrivate: true,
        onlyPublic: true
    };
}));

app.get("/plunks/trending", plunks.createListing(function (req, res) {
    return {
        baseUrl: apiUrl + "/plunks/trending",
        sort: "-score -updated_at",
        ignorePrivate: true,
        onlyPublic: true
    };
}));

app.get("/plunks/popular", plunks.createListing(function (req, res) {
    return {
        baseUrl: apiUrl + "/plunks/popular",
        sort: "-thumbs -updated_at",
        ignorePrivate: true,
        onlyPublic: true
    };
}));

app.get("/plunks/views", plunks.createListing(function (req, res) {
    return {
        baseUrl: apiUrl + "/plunks/views",
        sort: "-views -updated_at",
        ignorePrivate: true,
        onlyPublic: true
    };
}));

app.get("/plunks/forked", plunks.createListing(function (req, res) {
    return {
        baseUrl: apiUrl + "/plunks/forked",
        sort: "-forked -updated_at",
        ignorePrivate: true,
        onlyPublic: true
    };
}));

app.get("/plunks/remembered", users.withCurrentUser, plunks.createListing(function (req, res) {
    return {
        sort: "-updated_at",
        ignorePrivate: true,
        query: {
            rememberers: req.currentUser._id
        },
        baseUrl: apiUrl + "/users/" + req.params.login + "/remembered"
    };
}));

app.post("/plunks", sessions.withCurrentSession, validateSchema(plunks.schema.create), plunks.create);

app.get("/plunks/:id", plunks.withPlunk, plunks.read);

app.post("/plunks/:id", sessions.withCurrentSession, validateSchema(plunks.schema.update), plunks.withPlunk, plunks.ownsPlunk, plunks.update);

app.del("/plunks/:id", plunks.withPlunk, plunks.ownsPlunk, plunks.destroy);

app.post("/plunks/:id/freeze", sessions.withCurrentSession, plunks.withPlunk, plunks.ownsPlunk, plunks.freeze);

app.del("/plunks/:id/freeze", sessions.withCurrentSession, plunks.withPlunk, plunks.ownsPlunk, plunks.unfreeze);

app.post("/plunks/:id/thumb", sessions.withCurrentSession, plunks.withPlunk, plunks.setThumbed);

app.del("/plunks/:id/thumb", sessions.withCurrentSession, plunks.withPlunk, plunks.unsetThumbed);

app.post("/plunks/:id/remembered", sessions.withCurrentSession, plunks.withPlunk, plunks.setRemembered);

app.del("/plunks/:id/remembered", sessions.withCurrentSession, plunks.withPlunk, plunks.unsetRemembered);

forkSchema = function (req) {
    if (req.apiVersion === 0) {
        return plunks.schema.create;
    } else if (req.apiVersion === 1) {
        return plunks.schema.fork;
    }
};

app.post("/plunks/:id/forks", sessions.withCurrentSession, validateSchema(forkSchema), plunks.withPlunk, plunks.fork);

app.get("/plunks/:id/forks", plunks.createListing(function (req, res) {
    return {
        query: {
            fork_of: req.params.id
        },
        baseUrl: apiUrl + "/plunk/" + req.params.id + "/forks",
        sort: "-updated_at",
        ignorePrivate: true,
        onlyPublic: true
    };
}));

app.get("/users/:login", users.withUser, users.read);

app.get("/users/:login/plunks", users.withUser, plunks.createListing(function (req, res) {
    return {
        sort: "-updated_at",
        query: {
            user: req.user._id
        },
        baseUrl: apiUrl + "/users/" + req.params.login + "/plunks",
        ignorePrivate: req.currentUser && req.currentUser.login === req.params.login,
        onlyPublic: !req.currentUser || req.currentUser.login !== req.params.login
    };
}));

app.get("/users/:login/plunks/tagged/:tag", users.withUser, plunks.createListing(function (req, res) {
    return {
        sort: "-updated_at",
        query: {
            user: req.user._id,
            tags: req.params.tag
        },
        baseUrl: apiUrl + "/users/" + req.params.login + "/plunks/tagged/" + req.params.tag,
        ignorePrivate: req.currentUser && req.currentUser.login === req.params.login,
        onlyPublic: !req.currentUser || req.currentUser.login !== req.params.login
    };
}));

app.get("/users/:login/thumbed", users.withUser, plunks.createListing(function (req, res) {
    return {
        sort: "-updated_at",
        query: {
            voters: req.user._id
        },
        baseUrl: apiUrl + "/users/" + req.params.login + "/thumbed",
        ignorePrivate: req.currentUser && req.currentUser.login === req.params.login,
        onlyPublic: !req.currentUser || req.currentUser.login !== req.params.login
    };
}));

app.get("/users/:login/remembered", users.withUser, plunks.createListing(function (req, res) {
    return {
        sort: "-updated_at",
        query: {
            rememberers: req.user._id
        },
        baseUrl: apiUrl + "/users/" + req.params.login + "/remembered",
        ignorePrivate: req.currentUser && req.currentUser.login === req.params.login,
        onlyPublic: !req.currentUser || req.currentUser.login !== req.params.login
    };
}));


/*

 * Comments
comments = require "./resources/comments"


app.post "/plunks/:id/comments", comments.create
app.get "/comments/:id", comments.read
app.post "/comments/:id", comments.update
app.del "/comments/:id", comments.destroy
 */

packages = require("./resources/packages");

app.get("/catalogue/packages", packages.createListing(function (req, res) {
    var q;
    if (q = req.param("query")) {
        return {
            query: {
                name: {
                    $regex: "^" + q
                }
            }
        };
    } else {
        return {};
    }
}));

app.post("/catalogue/packages", validateSchema(packages.schema.create), users.withCurrentUser, packages.create);

app.get("/catalogue/packages/:name", packages.withPackage, packages.read);

app.post("/catalogue/packages/:name", validateSchema(packages.schema.update), users.withCurrentUser, packages.withPackage, packages.update);

app.post("/catalogue/packages/:name/bump", users.withCurrentUser, packages.withPackage, packages.bump);

app.del("/catalogue/packages/:name", packages.withOwnPackage, packages.destroy);

app.post("/catalogue/packages/:name/maintainers", packages.withOwnPackage, packages.addMaintainer);

app.del("/catalogue/packages/:name/maintainers", packages.withOwnPackage, packages.removeMaintainer);

app.post("/catalogue/packages/:name/versions", validateSchema(packages.schema.versions.create), users.withCurrentUser, packages.withPackage, packages.versions.create);

app.post("/catalogue/packages/:name/versions/:semver", validateSchema(packages.schema.versions.update), users.withCurrentUser, packages.withPackage, packages.versions.update);

app.del("/catalogue/packages/:name/versions/:semver", packages.withOwnPackage, packages.versions.destroy);

tags = require("./resources/tags");

app.get("/tags", tags.list);

app.get("/tags/:taglist", plunks.createListing(function (req, res) {
    var taglist;
    taglist = req.params.taglist.split(",");
    if (!taglist.length) {
        return res.json([]);
    }
    return {
        query: taglist.length > 1 ? {
            tags: {
                $all: taglist
            }
        } : {
                tags: taglist[0]
            },
        baseUrl: apiUrl + "/tags/" + req.params.taglist,
        sort: "-score -updated_at"
    };
}));

app.get("/favicon.ico", function (req, res, next) {
    return res.send("");
});

app.all("*", function (req, res, next) {
    return next(new apiErrors.NotFound);
});

PRUNE_FREQUENCY = 1000 * 60 * 60 * 6;

pruneSessions = function () {
    console.log("[INFO] Pruning sessions");
    sessions.prune(function (err, numDocs) {
        if (err) {
            return console.log("[ERR] Pruning failed", err.message);
        } else {
            return console.log("[OK] Pruned " + numDocs + " sessions");
        }
    });
    return setTimeout(pruneSessions, PRUNE_FREQUENCY);
};

pruneSessions();
