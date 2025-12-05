// cypress/e2e/admin/login.cy.ts

describe('Admin Login', () => {
  const validEmail = 'akisolve@gmail.com';
  const validPassword = 'rewards';

  beforeEach(() => {
    cy.visit('/admin/login');
  });

  it('logs in successfully and redirects to dashboard', () => {
    cy.dataCy('email').type(validEmail);
    cy.dataCy('password').type(validPassword);
    cy.dataCy('login-button').click();

    // Verify URL includes dashboard
    cy.url().should('include', '/dashboard');

    // Optional: check a dashboard element
    cy.dataCy('dashboard-header').should('be.visible');
  });

  it('shows error with invalid credentials', () => {
    cy.dataCy('email').type('wrong@example.com');
    cy.dataCy('password').type('wrongpass');
    cy.dataCy('login-button').click();

    cy.dataCy('login-error').should('contain.text', 'Invalid email or password');

  });
});
