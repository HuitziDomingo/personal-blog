import { TestBed } from '@angular/core/testing';

import angularJson from '../../../../angular.json';
import { API_BASE_URL } from './api-config';

describe('API_BASE_URL', () => {
  it('toma el valor del define de la configuración development', () => {
    // Los tests corren con la configuración development del build.
    const literal = angularJson.projects.admin.architect.build.configurations.development.define
      .ADMIN_API_BASE_URL;

    expect(TestBed.inject(API_BASE_URL)).toBe(literal.slice(1, -1));
  });
});
