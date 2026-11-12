import { TestBed } from '@angular/core/testing';

import { CommentsApi } from '../api/comments-api';
import { ApiError } from '../http/api-error';
import { aComment, FakeCommentsApi } from './comments-fakes';
import { PendingComments } from './pending-comments';

function setup(api = new FakeCommentsApi()) {
  TestBed.configureTestingModule({ providers: [{ provide: CommentsApi, useValue: api }] });
  return { api, pending: TestBed.inject(PendingComments) };
}

describe('PendingComments', () => {
  it('empieza sin número y pide solo el total de pendientes', () => {
    const api = new FakeCommentsApi();
    api.comments = [aComment({ id: 'a' }), aComment({ id: 'b' }), aComment({ id: 'c', status: 'rejected' })];
    const { pending } = setup(api);

    expect(pending.count()).toBeNull();
    pending.refresh();

    expect(pending.count()).toBe(2);
    expect(api.listCalls).toEqual([{ status: 'pending', limit: 1, offset: 0 }]);
  });

  it('si la petición falla, vuelve a null', () => {
    const api = new FakeCommentsApi();
    const { pending } = setup(api);
    pending.refresh();
    expect(pending.count()).toBe(0);

    api.nextError.list = new ApiError('x', 503, null);
    pending.refresh();

    expect(pending.count()).toBeNull();
  });
});
