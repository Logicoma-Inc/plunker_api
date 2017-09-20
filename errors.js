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
            return console.error("[ERR] " + this.message, err);
        }
    }
};

for (name in errorTypes) {
    errDef = errorTypes[name];
    exports[name] = createErrorClass(name, errDef);
}
