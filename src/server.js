require('dotenv').config(); // load .env
const Hapi = require('@hapi/hapi');

const AlbumsService = require('./services/postgres/AlbumsService');
const AlbumsValidator = require('./api/albums/validator');
const albums = require('./api/albums');

const SongsService = require('./services/postgres/SongsService');
const SongsValidator = require('./api/songs/validator');
const songs = require('./api/songs');


const init = async () => {
  const server = Hapi.server({
    port: process.env.PORT,
    host: process.env.HOST,
    routes: {
      cors: {
        origin: ['*'], // agar bisa diakses dari mana saja
      },
    },
  });

  const albumsService = new AlbumsService();
  const songsService = new SongsService();

  await server.register([
    {
      plugin: albums,
      options: {
        service: albumsService,
        validator: AlbumsValidator,
      }
    },
    {
      plugin: songs,
      options: {
        service: songsService,
        validator: SongsValidator,
      },
    },
  ]);

  
  /*server.route({
    method: 'GET',
    path: '/',
    handler: () => ({
      status: 'success',
      message: 'OpenMusic API v1 ready!',
    }),
  });*/

  // Error Handling Global
  server.ext('onPreResponse', (request, h) => {
    const { response } = request;

    // Tangani error buatan (instance Error khusus)
    if (response instanceof Error) {
      // Client error (custom)
      if (response.name === 'InvariantError' || response.name === 'NotFoundError') {
        const newResponse = h.response({
          status: 'fail',
          message: response.message,
        });
        newResponse.code(response.name === 'InvariantError' ? 400 : 404);
        return newResponse;
      }

      // Joi validation error
      if (response.isJoi) {
        const newResponse = h.response({
          status: 'fail',
          message: response.message,
        });
        newResponse.code(400);
        return newResponse;
      }

      // Server error tak dikenal
      const newResponse = h.response({
        status: 'error',
        message: 'Maaf, terjadi kegagalan pada server kami.',
      });
      newResponse.code(500);
      console.error(response); // log error internal
      return newResponse;
    }

    // Bukan error → teruskan respons normal
    return h.continue;
  });

  
  await server.start();
  console.log(`Server berjalan pada ${server.info.uri}`);
};

init();