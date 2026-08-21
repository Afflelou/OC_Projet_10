let env;

beforeEach(() => {
  cy.env(["apiUrl", "username", "password"]).then((values) => {
    env = values;
  });
});

const findAvailableProduct = () =>
  cy
    .request(`${env.apiUrl}/products`)
    .then((response) => response.body.find((product) => product.availableStock > 0));

const loginViaUi = () => {
  cy.visit("/#/login");
  cy.getBySel("login-input-username").type(env.username);
  cy.getBySel("login-input-password").type(env.password);
  cy.getBySel("login-submit").click();
  cy.getBySel("nav-link-logout").should("be.visible");
};

const addProductToCart = () =>
  findAvailableProduct().then((product) => {
    cy.visit(`/#/products/${product.id}`);
    cy.getBySel("detail-product-name").should("contain", product.name);
    cy.getBySel("detail-product-quantity").clear().type("1");
    cy.getBySel("detail-product-add").click();
    cy.url().should("include", "#/cart");
    return cy.wrap(product, { log: false });
  });

describe("Smoke - parcours critique", () => {
  it("the home page loads with featured products", () => {
    cy.visit("/");
    cy.getBySel("product-home").should("have.length", 3);
    cy.getBySel("product-home-name").first().should("not.be.empty");
    cy.getBySel("product-home-price").first().should("contain", "€");
  });

  it("the product list opens a product sheet", () => {
    cy.visit("/#/products");
    cy.getBySel("product").should("have.length.greaterThan", 0);
    cy.getBySel("product-link").first().click();

    cy.url().should("include", "#/products/");
    cy.getBySel("detail-product-name").should("not.be.empty");
    cy.getBySel("detail-product-price").should("contain", "€");
    cy.getBySel("detail-product-stock").should("contain", "en stock");
  });

  it("a visitor adding to cart is sent to the login page", () => {
    findAvailableProduct().then((product) => {
      cy.visit(`/#/products/${product.id}`);
      cy.getBySel("detail-product-add").click();
      cy.url().should("include", "#/login");
    });
  });

  it("a user can log in", () => {
    loginViaUi();
    cy.url().should("not.include", "#/login");
    cy.window().its("localStorage.user").should("be.a", "string").and("not.be.empty");
  });

  it("a logged in user can add a product to the cart", () => {
    loginViaUi();

    addProductToCart().then((product) => {
      cy.getBySel("cart-line").should("have.length.greaterThan", 0);
      cy.getBySel("cart-line-name").should("contain", product.name);
      cy.getBySel("cart-total").should("contain", "€");
    });
  });

  it("a user can complete an order", () => {
    loginViaUi();
    addProductToCart();

    cy.getBySel("cart-input-lastname").type("QA");
    cy.getBySel("cart-input-firstname").type("Test");
    cy.getBySel("cart-input-address").type("1 rue des Tests");
    cy.getBySel("cart-input-zipcode").type("75001");
    cy.getBySel("cart-input-city").type("Paris");
    cy.getBySel("cart-submit").click();

    cy.url().should("include", "#/confirmation");
    cy.contains("Votre commande est bien validée").should("be.visible");
  });

  it("the reviews page displays the reviews", () => {
    cy.visit("/#/reviews");
    cy.getBySel("review-detail").should("have.length.greaterThan", 0);
    cy.getBySel("reviews-number").should("contain", "avis");
    cy.getBySel("review-title").first().should("not.be.empty");
  });

  it("a user can log out", () => {
    loginViaUi();
    cy.getBySel("nav-link-logout").click();

    cy.getBySel("nav-link-login").should("be.visible");
    cy.getBySel("nav-link-cart").should("not.exist");
  });
});
