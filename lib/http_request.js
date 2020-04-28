/**
 * Copyright 2018 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const debugServer = require('debug')('carlo:server');

const statusTexts = {
  '100': 'Continue',
  '101': 'Switching Protocols',
  '102': 'Processing',
  '200': 'OK',
  '201': 'Created',
  '202': 'Accepted',
  '203': 'Non-Authoritative Information',
  '204': 'No Content',
  '206': 'Partial Content',
  '207': 'Multi-Status',
  '208': 'Already Reported',
  '209': 'IM Used',
  '300': 'Multiple Choices',
  '301': 'Moved Permanently',
  '302': 'Found',
  '303': 'See Other',
  '304': 'Not Modified',
  '305': 'Use Proxy',
  '306': 'Switch Proxy',
  '307': 'Temporary Redirect',
  '308': 'Permanent Redirect',
  '400': 'Bad Request',
  '401': 'Unauthorized',
  '402': 'Payment Required',
  '403': 'Forbidden',
  '404': 'Not Found',
  '405': 'Method Not Allowed',
  '406': 'Not Acceptable',
  '407': 'Proxy Authentication Required',
  '408': 'Request Timeout',
  '409': 'Conflict',
  '410': 'Gone',
  '411': 'Length Required',
  '412': 'Precondition Failed',
  '413': 'Payload Too Large',
  '414': 'URI Too Long',
  '415': 'Unsupported Media Type',
  '416': 'Range Not Satisfiable',
  '417': 'Expectation Failed',
  '418': 'I\'m a teapot',
  '421': 'Misdirected Request',
  '422': 'Unprocessable Entity',
  '423': 'Locked',
  '424': 'Failed Dependency',
  '426': 'Upgrade Required',
  '428': 'Precondition Required',
  '429': 'Too Many Requests',
  '431': 'Request Header Fields Too Large',
  '451': 'Unavailable For Legal Reasons',
  '500': 'Internal Server Error',
  '501': 'Not Implemented',
  '502': 'Bad Gateway',
  '503': 'Service Unavailable',
  '504': 'Gateway Timeout',
  '505': 'HTTP Version Not Supported',
  '506': 'Variant Also Negotiates',
  '507': 'Insufficient Storage',
  '508': 'Loop Detected',
  '510': 'Not Extended',
  '511': 'Network Authentication Required',
};

/**
 * Intercepted request instance that can be resolved to the client's liking.
 */
class HttpRequest {
  /**
   * @param {!CDPSession} session
   * @param {!Object} params
   */
  constructor(session, params, handlers) {
    this.session_ = session;
    this.params_ = params;
    this.handlers_ = handlers;
    this.done_ = false;
    this.callNextHandler_();
  }

  /**
   * @return {string}
   */
  url() {
    return this.params_.request.url;
  }

  /**
   * @return {string}
   */
  method() {
    return this.params_.request.method;
  }

  /**
   * @return {!Object<string, string>} HTTP request headers.
   */
  headers() {
    return this.params_.request.headers || {};
  }

  /**
   * @return {string}
   */
  resourceType() {
    return this.params_.resourceType;
  }

  /**
   * Aborts the request.
   */
  abort() {
    debugServer('abort', this.url());
    this.done_ = true;
    return this.session_.send('Fetch.failRequest', {
      requestId: this.params_.requestId,
      errorReason: 'Failed'
    });
  }


  /**
   * Fails the request.
   */
  fail() {
    debugServer('fail', this.url());
    this.done_ = true;
    return this.session_.send('Fetch.failRequest', {
      requestId: this.params_.requestId,
      errorReason: 'Failed'
    });
  }

  /**
   * Falls through to the next handler.
   */
  continue() {
    debugServer('continue', this.url());
    return this.callNextHandler_();
  }

  /**
   * Continues the request with the provided overrides to the url, method or
   * headers.
   *
   * @param {{url: (string|undefined), method: (string|undefined),
   *     headers: (!Object<string, string>|undefined)}|undefined} overrides
   * Overrides to apply to the request before it hits network.
   */
  deferToBrowser(overrides) {
    debugServer('deferToBrowser', this.url());
    const params = {};
    if (overrides && overrides.url) params.url = overrides.url;
    if (overrides && overrides.method) params.method = overrides.method;
    if (overrides && overrides.headers) params.headers = overrides.headers;
    return this.resolve_(params);
  }

  /**
   * Fulfills the request with the given data.
   *
   * @param {{status: number|undefined,
   *          headers: !Object<string,string>|undefined,
   *          body: !Buffer|undefined}} options
   */
  fulfill({status, headers, body}) {
    debugServer('fulfill', this.url());
    status = status || 200;
    const responseHeaders = [];
    let hasContentLength = false;
    if (headers) {
      for (const header of Object.keys(headers)) {
        const headerName = header.toLowerCase();
        if (headerName === 'content-length')
          hasContentLength = true;
        responseHeaders.push({name: headerName, value: headers[header]})
      }
    }
    if (body && !hasContentLength)
      responseHeaders.push({name: 'content-length', value: String(Buffer.byteLength(body))})

    const responseBuffer = body || Buffer.from('');

    this.done_ = true;
    return this.session_.send('Fetch.fulfillRequest', {
      requestId: this.params_.requestId,
      responseCode: status,
      responseHeaders: responseHeaders,
      body: responseBuffer.toString('base64')
    });
  }

  callNextHandler_() {
    debugServer('next handler', this.url());
    const handler = this.handlers_.shift();
    if (handler) {
      handler(this);
      return;
    }
    this.resolve_({});
  }

  /**
   * Aborts the request.
   * @param {!Object} params
   */
  async resolve_(params) {
    debugServer('resolve', this.url());
    if (this.done_) throw new Error('Already resolved given request');
    params.requestId = this.params_.requestId;
    this.done_ = true;
    return this.session_.send('Fetch.continueRequest', params);
  }
}

module.exports = { HttpRequest };
