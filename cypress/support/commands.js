Cypress.Commands.add("getBySel", (selector) => {
  return cy.get(`[data-cy="${selector}"]`);
});
