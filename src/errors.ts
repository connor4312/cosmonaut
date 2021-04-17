import * as Cosmos from '@azure/cosmos';

export class CosmosError extends Error implements Cosmos.ErrorResponse {
  code?: number;
  substatus?: number;
  body?: Cosmos.ErrorBody;
  headers?: Cosmos.CosmosHeaders;
  activityId?: string;
  retryAfterInMs?: number;
  retryAfterInMilliseconds?: number;
  stack?: string;

  constructor(opts: {
    code?: number;
    substatus?: number;
    body?: Cosmos.ErrorBody;
    headers?: Cosmos.CosmosHeaders;
    activityId?: string;
    retryAfterInMs?: number;
    retryAfterInMilliseconds?: number;
  }) {
    super(`${opts.code || opts.substatus} error from Cosmos DB`);
    this.code = opts.code;
    this.substatus = opts.substatus;
    this.body = opts.body;
    this.headers = opts.headers;
    this.activityId = opts.activityId;
    this.retryAfterInMs = opts.retryAfterInMs;
    this.retryAfterInMilliseconds = opts.retryAfterInMilliseconds;
  }
}
