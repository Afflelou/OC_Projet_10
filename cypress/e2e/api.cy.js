let env;

beforeEach(() => {
  cy.env(["apiUrl", "username", "password"]).then((values) => {
    env = values;
  });
});

const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

const login = () =>
  cy
    .request({
      method: "POST",
      url: `${env.apiUrl}/login`,
      body: { username: env.username, password: env.password },
    })
    .then((response) => response.body.token);

const findProduct = (predicate, description) =>
  cy.request(`${env.apiUrl}/products`).then((response) => {
    const product = response.body.find(predicate);
    expect(product, description).to.not.be.undefined;
    return product;
  });

const findCartLine = (token, productId) =>
  cy
    .request({ url: `${env.apiUrl}/orders`, headers: authHeaders(token) })
    .then((response) =>
      response.body.orderLines.find((line) => line.product.id === productId) ?? null
    );

// Puts the cart back to the quantity it held before the test:
// deletes the line when it did not exist, resets its quantity otherwise.
const resetCartLine = (token, productId, previousQuantity) =>
  findCartLine(token, productId).then((line) => {
    if (line === null) {
      return;
    }

    if (previousQuantity === 0) {
      return cy.request({
        method: "DELETE",
        url: `${env.apiUrl}/orders/${line.id}/delete`,
        headers: authHeaders(token),
      });
    }

    return cy.request({
      method: "PUT",
      url: `${env.apiUrl}/orders/${line.id}/change-quantity`,
      headers: authHeaders(token),
      body: { quantity: previousQuantity },
    });
  });

// Tests that touch the cart register what they changed here, so the afterEach
// hook restores it even when the test fails mid-way.
let cartRestore = null;

const restoreCartAfterEach = () => {
  afterEach(() => {
    if (cartRestore === null) {
      return;
    }

    const { productId, previousQuantity } = cartRestore;
    cartRestore = null;

    login().then((token) => resetCartLine(token, productId, previousQuantity));
  });
};

describe("API - Login", () => {
  it("POST /login returns a token with valid credentials", () => {
    cy.request({
      method: "POST",
      url: `${env.apiUrl}/login`,
      body: {
        username: env.username,
        password: env.password,
      },
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property("token");
      expect(response.body.token).to.be.a("string").and.not.be.empty;
    });
  });

  it("POST /login rejects an unknown user with 401", () => {
    cy.request({
      method: "POST",
      url: `${env.apiUrl}/login`,
      body: {
        username: "utilisateur.inconnu@ecobliss-qa.fr",
        password: "peu-importe",
      },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(401);
      expect(response.body).to.not.have.property("token");
    });
  });

  it("POST /login rejects a wrong password with 401", () => {
    cy.request({
      method: "POST",
      url: `${env.apiUrl}/login`,
      body: {
        username: env.username,
        password: "wrong-password",
      },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(401);
      expect(response.body).to.not.have.property("token");
    });
  });
});

describe("API - Products", () => {
  it("GET /products returns the product list", () => {
    cy.request(`${env.apiUrl}/products`).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.be.an("array");
      expect(response.body.length).to.be.greaterThan(0);
    });
  });

  it("Products has the expected fields", () => {
    cy.request(`${env.apiUrl}/products`).then((response) => {
      const product = response.body[0];

      expect(product).to.have.property("id");
      expect(product).to.have.property("name");
      expect(product).to.have.property("price");
      expect(product).to.have.property("availableStock");
      expect(product).to.have.property("description");
      expect(product).to.have.property("picture");
    });
  });

  it("GET /products/:id returns a single product", () => {
    cy.request(`${env.apiUrl}/products`).then((listResponse) => {
      const firstProduct = listResponse.body[0];

      cy.request(`${env.apiUrl}/products/${firstProduct.id}`).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.id).to.eq(firstProduct.id);
        expect(response.body.name).to.eq(firstProduct.name);
        expect(response.body).to.have.property("price");
        expect(response.body).to.have.property("availableStock");
      });
    });
  });

  it("GET /products/:id returns 404 for an unknown product", () => {
    cy.request({
      url: `${env.apiUrl}/products/999999`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(404);
    });
  });
});

describe("API - Cart (GET /orders)", () => {
  restoreCartAfterEach();

  it("GET /orders returns 401 when not logged in", () => {
    cy.request({
      url: `${env.apiUrl}/orders`,
      failOnStatusCode: false,
    }).then((response) => {
      // 401 = not authenticated (no token), as opposed to 403 = authenticated
      // but without the required rights.
      expect(response.status).to.eq(401);
      expect(response.body).to.not.have.property("orderLines");
    });
  });

  it("GET /orders returns 401 with an invalid token", () => {
    cy.request({
      url: `${env.apiUrl}/orders`,
      headers: authHeaders("not-a-valid-jwt"),
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(401);
    });
  });

  it("GET /orders returns the products in the cart of the logged in user", () => {
    login().then((token) => {
      findProduct((product) => product.availableStock > 0, "a product in stock").then(
        (product) => {
          findCartLine(token, product.id).then((lineBefore) => {
            cartRestore = {
              productId: product.id,
              previousQuantity: lineBefore === null ? 0 : lineBefore.quantity,
            };

            cy.request({
              method: "PUT",
              url: `${env.apiUrl}/orders/add`,
              headers: authHeaders(token),
              body: { product: product.id, quantity: 1 },
            });

            cy.request({
              url: `${env.apiUrl}/orders`,
              headers: authHeaders(token),
            }).then((response) => {
              expect(response.status).to.eq(200);
              expect(response.body).to.have.property("orderLines");
              expect(response.body.orderLines).to.be.an("array").and.not.be.empty;

              response.body.orderLines.forEach((line) => {
                expect(line).to.have.property("id");
                expect(line).to.have.property("quantity");
                expect(line.product).to.have.property("id");
                expect(line.product).to.have.property("name");
                expect(line.product).to.have.property("price");
              });

              const productIds = response.body.orderLines.map((line) => line.product.id);
              expect(productIds).to.include(product.id);
            });
          });
        }
      );
    });
  });
});

describe("API - Add to cart (PUT /orders/add)", () => {
  restoreCartAfterEach();

  it("PUT /orders/add returns 401 when not logged in", () => {
    findProduct((product) => product.availableStock > 0, "a product in stock").then(
      (product) => {
        cy.request({
          method: "PUT",
          url: `${env.apiUrl}/orders/add`,
          body: { product: product.id, quantity: 1 },
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status).to.eq(401);
        });
      }
    );
  });

  it("PUT /orders/add adds an available product to the cart", () => {
    login().then((token) => {
      findProduct((product) => product.availableStock > 1, "a product in stock").then(
        (product) => {
          findCartLine(token, product.id).then((lineBefore) => {
            const previousQuantity = lineBefore === null ? 0 : lineBefore.quantity;
            cartRestore = { productId: product.id, previousQuantity };

            cy.request({
              method: "PUT",
              url: `${env.apiUrl}/orders/add`,
              headers: authHeaders(token),
              body: { product: product.id, quantity: 2 },
            }).then((response) => {
              expect(response.status).to.eq(200);
              expect(response.body).to.have.property("orderLines");

              const line = response.body.orderLines.find(
                (orderLine) => orderLine.product.id === product.id
              );

              expect(line, "the product is present in the returned cart").to.not.be
                .undefined;
              expect(line.quantity).to.eq(previousQuantity + 2);
            });
          });
        }
      );
    });
  });

  it("PUT /orders/add refuses an out-of-stock product", () => {
    // ANOMALY: the API answers 200 and adds the line even though availableStock <= 0.
    // This test asserts the expected behaviour, so it fails as long as the bug is open.
    login().then((token) => {
      findProduct(
        (product) => product.availableStock <= 0,
        "a product out of stock"
      ).then((product) => {
        findCartLine(token, product.id).then((lineBefore) => {
          cartRestore = {
            productId: product.id,
            previousQuantity: lineBefore === null ? 0 : lineBefore.quantity,
          };

          cy.request({
            method: "PUT",
            url: `${env.apiUrl}/orders/add`,
            headers: authHeaders(token),
            body: { product: product.id, quantity: 1 },
            failOnStatusCode: false,
          }).then((response) => {
            expect(
              response.status,
              `product ${product.id} has a stock of ${product.availableStock} and must not be added`
            ).to.be.gte(400);
          });
        });
      });
    });
  });

  it("POST /orders/add is not supported (the route only accepts PUT)", () => {
    // The specification documents POST /orders/add, the API only exposes PUT.
    login().then((token) => {
      findProduct((product) => product.availableStock > 0, "a product in stock").then(
        (product) => {
          cy.request({
            method: "POST",
            url: `${env.apiUrl}/orders/add`,
            headers: authHeaders(token),
            body: { product: product.id, quantity: 1 },
            failOnStatusCode: false,
          }).then((response) => {
            expect(response.status).to.eq(405);
          });
        }
      );
    });
  });
});

describe("API - Reviews (POST /reviews)", () => {
  it("GET /reviews returns the review list", () => {
    cy.request(`${env.apiUrl}/reviews`).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.be.an("array");
    });
  });

  it("POST /reviews returns 401 when not logged in", () => {
    cy.request({
      method: "POST",
      url: `${env.apiUrl}/reviews`,
      body: { title: "Avis anonyme", comment: "Sans authentification", rating: 4 },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(401);
    });
  });

  it("POST /reviews adds a review for the logged in user", () => {
    const review = {
      title: `Avis QA ${Cypress._.random(100000)}`,
      comment: "Avis créé par le test API automatisé.",
      rating: 4,
    };

    login().then((token) => {
      cy.request({
        method: "POST",
        url: `${env.apiUrl}/reviews`,
        headers: authHeaders(token),
        body: review,
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body).to.have.property("id");
        expect(response.body.title).to.eq(review.title);
        expect(response.body.comment).to.eq(review.comment);
        expect(response.body.rating).to.eq(review.rating);
      });

      cy.request(`${env.apiUrl}/reviews`).then((response) => {
        const titles = response.body.map((item) => item.title);
        expect(titles, "the review is returned by GET /reviews").to.include(review.title);
      });
    });
  });

  it("POST /reviews rejects a rating outside 1-5 with 400", () => {
    login().then((token) => {
      cy.request({
        method: "POST",
        url: `${env.apiUrl}/reviews`,
        headers: authHeaders(token),
        body: { title: "Note hors bornes", comment: "Note à 10", rating: 10 },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(400);
      });
    });
  });

  it("GET /reviews does not expose the author password hash", () => {
    // ANOMALY: the API serialises the whole User entity, password hash included.
    cy.request(`${env.apiUrl}/reviews`).then((response) => {
      response.body.forEach((review) => {
        expect(review.author, `author of review ${review.id}`).to.not.have.property(
          "password"
        );
      });
    });
  });
});
