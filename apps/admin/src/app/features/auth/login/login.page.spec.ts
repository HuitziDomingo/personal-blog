import { fireEvent, render, screen } from '@testing-library/angular';

import { LoginPage } from './login.page';

describe('LoginPage', () => {
  it('muestra el formulario con email y contraseña', async () => {
    await render(LoginPage);

    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Contraseña')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy();
  });

  it('no muestra errores antes de interactuar', async () => {
    await render(LoginPage);

    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  it('muestra los errores de campos vacíos al enviar', async () => {
    await render(LoginPage);

    await fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Escribe tu email.')).toBeTruthy();
    expect(screen.getByText('Escribe tu contraseña.')).toBeTruthy();
  });

  it('rechaza un email con formato inválido', async () => {
    await render(LoginPage);

    await fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'no-es-un-email' } });
    await fireEvent.input(screen.getByLabelText('Contraseña'), { target: { value: 'secreta' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('El email no es válido.')).toBeTruthy();
    expect(screen.queryByText('Escribe tu contraseña.')).toBeNull();
  });

  it('acepta un formulario válido sin errores', async () => {
    await render(LoginPage);

    await fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'admin@huitzi.xyz' } });
    await fireEvent.input(screen.getByLabelText('Contraseña'), { target: { value: 'secreta' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });
});
