import app from '../src/index'; // Import your main Hono app

export default {
  port: 3000,
  fetch: (request: Request) => {
    return app.fetch(request);
  },
};
