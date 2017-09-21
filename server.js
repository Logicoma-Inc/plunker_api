var App = require('./app.js');
var Nconf = require('nconf');

App.listen(Nconf.get('PORT'), function(err) {
    if (err) throw err;
    
    console.log('[OK] API server listening on port `' + Nconf.get('PORT') + '`.');
});
