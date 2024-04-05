const express = require('express')
const path = require('path')
const bcrypt = require('bcrypt')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const jwt = require('jsonwebtoken')
const app = express()
app.use(express.json())
const dbPath = path.join(__dirname, 'twitterClone.db')

let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initializeDBAndServer()

///authenticate token

function authenticateToken(request, response, next) {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username

        next()
      }
    })
  }
}

/// following people user id

const followingPeoplesId = async username => {
  const getFollowingQuery = `
  SELECT 
    following_user_id 
  FROM 
    follower INNER JOIN user ON user.user_id=follower.follower_user_id
  WHERE user.username = '${username}';`
  const result = await db.all(getFollowingQuery)
  const arrayOfIds = result.map(eachItem => eachItem.following_user_id)

  return arrayOfIds
}

/// tweet access verification

const tweetAccessVerification = async (request, response, next) => {
  let {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  console.log(getUserId.user_id)
  const {tweetId} = request.params
  const getTweetQuery = `
  SELECT *
  FROM tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id
  WHERE tweet.tweet_id = '${tweetId}' AND follower_user_id = '${getUserId.user_id}';`
  const tweet = await db.get(getTweetQuery)
  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    next()
  }
}

///API-1

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    if (password.length > 6) {
      const hashedPassword = await bcrypt.hash(request.body.password, 10)
      const createUserQuery = `
        INSERT INTO 
            user (username, password, name, gender) 
        VALUES 
            (
                '${username}', 
                '${hashedPassword}', 
                '${name}',
                '${gender}'
            )`
      const dbResponse = await db.run(createUserQuery)
      response.status(200)
      response.send(`User created successfully`)
    } else {
      response.status(400)
      response.send('Password is too short')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

///API-2

app.post('/login', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(
      pgetUserId.user_idassword,
      dbUser.password,
    )
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      }
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

///API-3

app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request

  const followingPeoplesIdArray = await followingPeoplesId(username)
  const getTweets = `
  SELECT username, tweet, date_time as dateTime
  FROM user INNER JOIN tweet ON user.user_id = tweet.user_id
  WHERE user.user_id IN (${followingPeoplesIdArray})
  ORDER BY date_time DESC
  LIMIT 4;`
  const result = await db.all(getTweets)
  response.send(result)
})

///API - 4

app.get('/user/following/', authenticateToken, async (request, response) => {
  let {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  console.log(getUserId.user_id)
  const getQuery = `
  SELECT
    name
  FROM follower INNER JOIN user ON user.user_id = follower.following_user_id
  WHERE  follower_user_id = '${getUserId.user_id}';`
  const result = await db.all(getQuery)
  response.send(result)
})

///API - 5
app.get('/user/followers/', authenticateToken, async (request, response) => {
  let {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  console.log(getUserId.user_id)
  const getQuery = `
  SELECT DISTINCT
    name
  FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
  WHERE  following_user_id = '${getUserId.user_id}';`
  const result = await db.all(getQuery)
  response.send(result)
})

///API-6
app.get(
  '/tweets/:tweetId/',
  authenticateToken,
  tweetAccessVerification,
  async (request, response) => {
    const {tweetId} = request.params
    const getQuery = `
  SELECT 
    tweet,
    (SELECT COUNT() FROM like WHERE tweet_id = '${tweetId}') AS likes,
    (SELECT COUNT() FROM reply WHERE tweet_id = '${tweetId}') AS replies,
    date_time AS dateTime
  FROM tweet
  WHERE  tweet.tweet_id = '${tweetId}';`
    const result = await db.all(getQuery)
    response.send(result)
  },
)

/// API-7

app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  tweetAccessVerification,
  async (request, response) => {
    const {tweetId} = request.params
    const getQuery = `
  SELECT username
  FROM user INNER JOIN like ON user.user_id = like.user_id
  WHERE  tweet_id = '${tweetId}';`
    const result = await db.all(getQuery)
    const userArray = result.map(eachItem => eachItem.username)
    response.send({likes: userArray})
  },
)

///API-8

app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  tweetAccessVerification,
  async (request, response) => {
    const {tweetId} = request.params
    const getQuery = `
  SELECT name, reply
  FROM user INNER JOIN reply ON user.user_id = reply.user_id 
  WHERE  tweet_id = '${tweetId}';`
    const result = await db.all(getQuery)
    response.send({replies: result})
  },
)

///API-9

app.get('/user/tweets/', authenticateToken, async (request, response) => {
  let {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  console.log(getUserId.user_id)
  const getQuery = `
  SELECT tweet,
  COUNT(DISTINCT like_id) AS likes,
  COUNT(DISTINCT reply_id) AS replies,
  date_time AS dateTime
  FROM tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id LEFT JOIN like ON reply.tweet_id = like.tweet_id
  WHERE tweet.user_id = ${getUserId.user_id}
  GROUP BY tweet.tweet_id;`
  const result = await db.all(getQuery)
  response.send(result)
})

///API-10
app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {tweet} = request.body
  let {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  console.log(getUserId.user_id)
  const userId = parseInt(request.userId)
  console.log(getUserId.user_id)
  const dateTime = new Date().toJSON().substring(0, 19).replace('T', ' ')
  const postQuery = `
  INSERT INTO tweet (tweet, user_id, date_time)
  VALUES ('${tweet}', '${getUserId.user_id}', '${dateTime}');`
  await db.run(postQuery)
  response.send('Created a Tweet')
})

///API-11
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    let {username} = request
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const getUserId = await db.get(getUserIdQuery)
    console.log(getUserId.user_id)
    const getTheTweetQuery = `SELECT * FROM tweet WHERE user_id = '${getUserId.user_id}' AND tweet_id = '${tweetId}';`
    const tweet = await db.get(getTheTweetQuery)
    if (tweet === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const deleteTweet = `DELETE FROM tweet WHERE tweet_id = '${tweetId}'`
      await db.run(deleteTweet)
      response.send('Tweet Removed')
    }
  },
)

module.exports = app
