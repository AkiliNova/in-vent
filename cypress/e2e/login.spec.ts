describe('Admin Login', () => {
  const email = 'admin@example.com'; // use a test admin email
  const password = 'testpassword';   // use a test password

  it('should log in successfully and redirect to dashboard', () => {
    // Visit login page
    cy.visit('/admin/login');

    // Fill email
    cy.get('#email').type(email);

    // Fill password
    cy.get('#password').type(password);

    // Click login button
    cy.get('[data-cy="login-button"]').click();

    // Wait for dashboard to load and check URL
    cy.url().should('include', '/dashboard');

    // Optional: check if a dashboard element is visible
    cy.contains('Dashboard').should('be.visible');
  });

  it('should show error on invalid credentials', () => {
    cy.visit('/admin/login');

    cy.get('#email').type('wrong@example.com');
    cy.get('#password').type('wrongpass');
    cy.get('[data-cy="login-button"]').click();

    // Assuming you show toast/error message
    cy.contains('Invalid credentials').should('be.visible');
  });
});
