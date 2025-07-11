require('dotenv').config(); // load .env
const Hapi = require('@hapi/hapi');
const Jwt = require('@hapi/jwt');

const ClientError = require('./exceptions/ClientError');

const AlbumsService = require('./services/postgres/AlbumsService');
const AlbumsValidator = require('./api/albums/validator');
const albums = require('./api/albums');

const SongsService = require('./services/postgres/SongsService');
const SongsValidator = require('./api/songs/validator');
const songs = require('./api/songs');

const users = require('./api/users');
const UsersService = require('./services/postgres/UsersService');
const UsersValidator = require('./api/users/validator');

const authentications = require('./api/authentications');
const AuthenticationsService = require('./services/postgres/AuthenticationsService');
const AuthenticationsValidator = require('./api/authentications/validator');
const TokenManager = require('./tokenize/TokenManager');

const playlists = require('./api/playlists');
const PlaylistsService = require('./services/postgres/PlaylistsService');
const PlaylistsValidator = require('./api/playlists/validator');

const collaborations = require('./api/collaborations');
const CollaborationsService = require('./services/postgres/CollaborationsService');
const CollaborationsValidator = require('./api/collaborations/validator');

const playlistActivities = require('./api/playlistactivities');
const PlaylistActivitiesService = require('./services/postgres/PlaylistActivitiesService');

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
  const usersService = new UsersService();
  const authenticationsService = new AuthenticationsService();
  const collaborationsService = new CollaborationsService();
  //const playlistsService = new PlaylistsService(collaborationsService);
  const playlistActivitiesService = new PlaylistActivitiesService();
  const playlistsService = new PlaylistsService(collaborationsService, playlistActivitiesService);
  //console.log('playlistsService instantiated:', playlistsService);
  //console.log('Does playlistsService have verifyPlaylistAccess?', typeof playlistsService.verifyPlaylistAccess);

  await server.register(Jwt);

  server.auth.strategy('openmusic_jwt', 'jwt', {
    keys: process.env.ACCESS_TOKEN_KEY,
    verify: {
      aud: false,
      iss: false,
      sub: false,
      maxAgeSec: process.env.ACCESS_TOKEN_AGE,
    },
    validate: (artifacts) => ({
      isValid: true,
      credentials: {
        id: artifacts.decoded.payload.id,
      },
    }),
  });

  //server.auth.default('openmusic_jwt'); // opsional default

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
    {
      plugin: users,
      options: {
        service: usersService,
        validator: UsersValidator,
      }
    },
    {
      plugin: authentications,
      options: {
        authenticationsService,
        usersService,
        tokenManager: TokenManager,
        validator: AuthenticationsValidator,
      },
    },
    {
      plugin: playlists,
      options: {
        service: playlistsService,
        validator: PlaylistsValidator,
      },
    },
    {
      plugin: collaborations,
      options: {
        service: collaborationsService,
        playlistsService, usersService,
        validator: CollaborationsValidator,
      },
    },
    {
      plugin: playlistActivities,
      options: {
        service: playlistActivitiesService,
        playlistsService,
      },
    }
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

    if (response.isBoom) {
      const { statusCode, payload } = response.output;

      // 401 Unauthorized
      if (statusCode === 401) {
        return h
          .response({
            status: 'fail',
            message: payload.message,
          })
          .code(401);
      }

      // 403 Forbidden
      if (statusCode === 403) {
        return h
          .response({
            status: 'fail',
            message: payload.message,
          })
          .code(403);
      }
    }

    // Tangani error buatan (instance Error khusus)
    if (response instanceof Error) {
      // Client error (custom)
      if (response instanceof ClientError) {
        const newResponse = h.response({
          status: 'fail',
          message: response.message,
        });
        newResponse.code(response.statusCode);
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

    /*akses tanpa token
    if (response.isBoom && response.output.statusCode === 401) {
      return h.response({
        status: 'fail',
        message: response.message,
      }).code(401);
    }*/

    /*unauthorized 403
    if (response.name === 'AuthorizationError') {
      return h.response({
        status: 'fail',
        message: response.message,
      }).code(403);
    }

    if (response.name === 'AuthenticationError') {
      const newResponse = h.response({
        status: 'fail',
        message: response.message,
      });
      newResponse.code(401);
      return newResponse;
    }*/

    // Bukan error → teruskan respons normal
    return h.continue;
  });

  await server.start();
  console.log(`Server berjalan pada ${server.info.uri}`);
};

init();