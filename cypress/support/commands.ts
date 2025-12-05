// cypress/support/commands.ts

Cypress.Commands.add('dataCy', (value: string) => {
  return cy.get(`[data-cy=${value}]`);
});

export {};

declare global {
  namespace Cypress {
    interface Chainable<Subject = any> {
      dataCy(value: string): Chainable<JQuery<HTMLElement>>;
    }
  }
}
