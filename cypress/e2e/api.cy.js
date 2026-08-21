let env;

beforeEach(() => {
  cy.env(["apiUrl", "username", "password"]).then((values) => {
    env = values;
  });
});

const auth = (token) => ({ Authorization: `Bearer ${token}` });

const login = () =>
  cy
    .request({
      method: "POST",
      url: `${env.apiUrl}/login`,
      body: { username: env.username, password: env.password },
    })
    .then((response) => response.body.token);

const findProduct = (predicate) =>
  cy.request(`${env.apiUrl}/products`).then((response) => response.body.find(predicate));

describe("API - GET", () => {
  it("GET /orders returns 401 when not logged in", () => {
    cy.request({
      url: `${env.apiUrl}/orders`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(401);
      expect(response.body).to.not.have.property("orderLines");
    });
  });

  it("GET /orders returns the products in the cart", () => {
    login().then((token) => {
      cy.request({ url: `${env.apiUrl}/orders`, headers: auth(token) }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.orderLines).to.be.an("array");

        response.body.orderLines.forEach((line) => {
          expect(line).to.have.property("quantity");
          expect(line.product).to.have.property("id");
          expect(line.product).to.have.property("name");
          expect(line.product).to.have.property("price");
        });
      });
    });
  });

  it("GET /products/:id returns the product sheet", () => {
    findProduct(() => true).then((product) => {
      cy.request(`${env.apiUrl}/products/${product.id}`).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.id).to.eq(product.id);
        expect(response.body.name).to.eq(product.name);
        expect(response.body).to.have.property("price");
        expect(response.body).to.have.property("availableStock");
      });
    });
  });
});

describe("API - POST", () => {
  it("POST /login returns 401 for an unknown user", () => {
    cy.request({
      method: "POST",
      url: `${env.apiUrl}/login`,
      body: { username: "utilisateur.inconnu@ecobliss-qa.fr", password: "peu-importe" },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(401);
      expect(response.body).to.not.have.property("token");
    });
  });

  it("POST /login returns 200 for a known user", () => {
    cy.request({
      method: "POST",
      url: `${env.apiUrl}/login`,
      body: { username: env.username, password: env.password },
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.token).to.be.a("string").and.not.be.empty;
    });
  });

  it("PUT /orders/add adds an available product to the cart", () => {
    login().then((token) => {
      findProduct((product) => product.availableStock > 0).then((product) => {
        cy.request({
          method: "PUT",
          url: `${env.apiUrl}/orders/add`,
          headers: auth(token),
          body: { product: product.id, quantity: 1 },
        }).then((response) => {
          expect(response.status).to.eq(200);

          const productIds = response.body.orderLines.map((line) => line.product.id);
          expect(productIds).to.include(product.id);
        });
      });
    });
  });

  it("PUT /orders/add refuses an out-of-stock product", () => {
    login().then((token) => {
      findProduct((product) => product.availableStock <= 0).then((product) => {
        cy.request({
          method: "PUT",
          url: `${env.apiUrl}/orders/add`,
          headers: auth(token),
          body: { product: product.id, quantity: 1 },
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status).to.be.gte(400);
        });
      });
    });
  });

  it("POST /reviews adds a review", () => {
    const review = {
      title: `Avis QA ${Cypress._.random(100000)}`,
      comment: "Avis créé par le test API automatisé.",
      rating: 4,
    };

    login().then((token) => {
      cy.request({
        method: "POST",
        url: `${env.apiUrl}/reviews`,
        headers: auth(token),
        body: review,
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.title).to.eq(review.title);
        expect(response.body.comment).to.eq(review.comment);
        expect(response.body.rating).to.eq(review.rating);
      });
    });
  });
});
