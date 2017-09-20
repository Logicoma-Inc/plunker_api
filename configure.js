var analytics, config, env, host, nconf;

nconf = require("nconf");

analytics = require("analytics-node");

env = process.env.NODE_ENV || "development";

nconf.use("memory").file({
    file: "config." + env + ".json"
}).defaults({
    PORT: 8888
});

if (config = nconf.get("analytics")) {
    analytics.init(config);
}

if (!(host = nconf.get("host"))) {
    console.error("The 'host' option is required for Plunker to run.");
    process.exit(1);
}
