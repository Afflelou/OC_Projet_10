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

const getCart = (token) =>
  cy.request({
    url: `${env.apiUrl}/orders`,
    headers: auth(token),
    failOnStatusCode: false,
  });

const addToCart = (token, productId, quantity) =>
  cy.request({
    method: "PUT",
    url: `${env.apiUrl}/orders/add`,
    headers: auth(token),
    body: { product: productId, quantity },
    failOnStatusCode: false,
  });

const findLine = (token, productId) =>
  getCart(token).then((response) =>
    response.body.orderLines.find((line) => line.product.id === productId)
  );

const emptyCart = () =>
  login().then((token) =>
    getCart(token).then((response) => {
      if (response.status !== 200) {
        return;
      }

      response.body.orderLines.forEach((line) =>
        cy.request({
          method: "DELETE",
          url: `${env.apiUrl}/orders/${line.id}/delete`,
          headers: auth(token),
        })
      );
    })
  );

afterEach(emptyCart);

const shippingDetails = {
  firstname: "Test",
  lastname: "QA",
  address: "1 rue des Tests",
  zipCode: "75001",
  city: "Paris",
};

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
      findProduct((product) => product.availableStock > 0).then((product) => {
        addToCart(token, product.id, 1);

        getCart(token).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body.orderLines).to.be.an("array").and.not.be.empty;

          response.body.orderLines.forEach((line) => {
            expect(line).to.have.property("quantity");
            expect(line.product).to.have.property("id");
            expect(line.product).to.have.property("name");
            expect(line.product).to.have.property("price");
          });

          const productIds = response.body.orderLines.map((line) => line.product.id);
          expect(productIds).to.include(product.id);
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

  it("GET /me returns 401 when not logged in", () => {
    cy.request({
      url: `${env.apiUrl}/me`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(401);
    });
  });

  it("GET /me returns the logged in user", () => {
    login().then((token) => {
      cy.request({ url: `${env.apiUrl}/me`, headers: auth(token) }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.email).to.eq(env.username);
        expect(response.body).to.have.property("firstname");
        expect(response.body).to.have.property("lastname");
      });
    });
  });

  it("GET /me does not expose the password hash", () => {
    login().then((token) => {
      cy.request({ url: `${env.apiUrl}/me`, headers: auth(token) }).then((response) => {
        expect(response.body).to.not.have.property("password");
        expect(response.body).to.not.have.property("salt");
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
        addToCart(token, product.id, 1).then((response) => {
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
        addToCart(token, product.id, 1).then((response) => {
          expect(response.status).to.be.gte(400);
        });
      });
    });
  });

  it("PUT /orders/add refuses a quantity above the available stock", () => {
    login().then((token) => {
      findProduct((product) => product.availableStock > 0).then((product) => {
        addToCart(token, product.id, product.availableStock + 1000).then((response) => {
          expect(response.status).to.be.gte(400);
        });
      });
    });
  });

  it("PUT /orders/:id/change-quantity refuses a quantity above the available stock", () => {
    login().then((token) => {
      findProduct((product) => product.availableStock > 0).then((product) => {
        addToCart(token, product.id, 1);

        findLine(token, product.id).then((line) => {
          cy.request({
            method: "PUT",
            url: `${env.apiUrl}/orders/${line.id}/change-quantity`,
            headers: auth(token),
            body: { quantity: product.availableStock + 1000 },
            failOnStatusCode: false,
          }).then((response) => {
            expect(response.status).to.be.gte(400);
          });
        });
      });
    });
  });

  it("POST /orders returns 401 when not logged in", () => {
    cy.request({
      method: "POST",
      url: `${env.apiUrl}/orders`,
      body: shippingDetails,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(401);
    });
  });

  it("POST /orders rejects an invalid zip code", () => {
    login().then((token) => {
      findProduct((product) => product.availableStock > 0).then((product) => {
        addToCart(token, product.id, 1);

        cy.request({
          method: "POST",
          url: `${env.apiUrl}/orders`,
          headers: auth(token),
          body: { ...shippingDetails, zipCode: "1" },
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status).to.eq(400);
        });
      });
    });
  });

  it("POST /orders validates the cart", () => {
    login().then((token) => {
      findProduct((product) => product.availableStock > 0).then((product) => {
        addToCart(token, product.id, 1);

        cy.request({
          method: "POST",
          url: `${env.apiUrl}/orders`,
          headers: auth(token),
          body: shippingDetails,
        }).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body.validated).to.be.true;
          expect(response.body.zipCode).to.eq(shippingDetails.zipCode);
          expect(response.body.orderLines).to.be.an("array").and.not.be.empty;
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
