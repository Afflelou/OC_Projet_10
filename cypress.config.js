const { defineConfig } = require("cypress");

module.exports = defineConfig({
  allowCypressEnv: false,

  e2e: {
    baseUrl: "http://localhost:4200",

    env: {
      apiUrl: "http://localhost:8081",
      username: "test2@test.fr",
      password: "testtest",
    },

    setupNodeEvents(on, config) {
    },
  },
});
