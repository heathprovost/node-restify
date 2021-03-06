// Copyright 2012 Mark Cavage, Inc.  All rights reserved.

var crypto = require('crypto');

var assert = require('assert-plus');
var querystring = require('qs');

var errors = require('../errors');



///--- Globals

var BadDigestError = errors.BadDigestError;
var InvalidContentError = errors.InvalidContentError;
var RequestEntityTooLargeError = errors.RequestEntityTooLargeError;

var MD5_MSG = 'Content-MD5 \'%s\' didn\'t match \'%s\'';
var MIME_TYPE = 'application/x-www-form-urlencoded';



///--- API

/**
 * Returns a plugin that will parse the HTTP request body IFF the
 * contentType is application/x-www-form-urlencoded.
 *
 * If req.params already contains a given key, that key is skipped and an
 * error is logged.
 *
 * @return {Function} restify handler.
 * @throws {TypeError} on bad input
 */
function urlEncodedBodyParser(options) {
        options = options || {};
        assert.object(options, 'options');

        var maxBodySize = options.maxBodySize || 0;
        var override = options.overrideParams;

        function parseUrlEncodedBody(req, res, next) {
                if (req.getContentType() !== MIME_TYPE ||
                    (req.getContentLength() === 0 && !req.isChunked())) {
                        return (next());
                }

                var bytesReceived = 0;
                var digest;
                var hash;
                var md5;

                if ((md5 = req.header('content-md5')))
                        hash = crypto.createHash('md5');

                req.body = '';
                req.on('data', function onRequestData(chunk) {
                        if (maxBodySize) {
                                bytesReceived += chunk.length;
                                if (bytesReceived > maxBodySize)
                                        return;
                        }

                        req.body += chunk.toString('utf8');
                        if (hash)
                                hash.update(chunk);
                });

                req.once('error', function onRequestError(err) {
                        return (next(err));
                });

                req.on('end', function onRequestEnd() {
                        if (maxBodySize && bytesReceived > maxBodySize) {
                                var msg = 'Request body size exceeds ' +
                                        maxBodySize;
                                next(new RequestEntityTooLargeError(msg));
                                return;
                        }

                        if (!req.body) {
                                next();
                                return;
                        }

                        if (hash && md5 !== (digest = hash.digest('base64'))) {
                                next(new BadDigestError(MD5_MSG, md5, digest));
                                return;
                        }

                        try {
                                var params = querystring.parse(req.body);
                                if (options.mapParams !== false) {
                                        var keys = Object.keys(params);
                                        keys.forEach(function (k) {
                                                var p = req.params[k];
                                                if (p && !override)
                                                        return (false);

                                                req.params[k] = params[k];
                                                return (true);
                                        });
                                } else {
                                        req._body = req.body;
                                        req.body = params;
                                }
                        } catch (e) {
                                e = new InvalidContentError(e.message);
                                next(e);
                                return;
                        }

                        req.log.trace('req.params now: %j', req.params);
                        next();
                });

                return (false);
        }

        return (parseUrlEncodedBody);
}

module.exports = urlEncodedBodyParser;
