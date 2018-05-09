/* eslint-disable no-var, prefer-template, func-names, prefer-arrow-callback */

/*
 * The health check expects the response's status code to be 200
 * Some apps set their status code to something else, which would
 * cause the health check to always fail.
 *
 * The health check gets sent to this server, which checks if
 * the app is responding to requests, and then sets the correct
 * status code for the health check.
 *
 * This uses the same version of node that the app is using,
 * so it needs to support Node 0.10.
 *
 * As a failsafe, the argument 'start' needs to get passed to the
 * server when being started.
 */

var http = require('http');

var debugEnabled = process.env.HEALTH_CHECK_VERBOSE === 'true';

var log = function log(message, debug) {
  if (!debug || debugEnabled) {
    console.log('[HealthCheck] ' + new Date() + ': ' + message);
  }
};


var server = http.createServer(function (request, response) {
  var timeout;
  var appRequest;

  log('Received health check request', true);

  appRequest = http.get('http://127.0.0.1:8081', function () {
    log('Health check succeeded', true);
    response.statusCode = 200;
    response.end('Success');
    clearTimeout(timeout);
  }).on('error', function (e) {
    log('Request to app failed ' + e);
    response.statusCode = 500;
    response.end('Failed');
    clearTimeout(timeout);
  });

  timeout = setTimeout(function () {
    log('Request to app timed out after 3 seconds');
    appRequest.abort();
  }, 3000);
});

if (process.argv && process.argv[2] === 'start') {
  try {
    server.listen(8039);
    log('Started health check server', true);
  } catch (e) {
    // Port is being used, likely from another health-check server running
    log('Port being used');

    try {
      log('Starting health check server on backup port');
      server.listen(8049);
    } catch (eBackup) {
      log('Backup-port being used');
    }
  }
}
