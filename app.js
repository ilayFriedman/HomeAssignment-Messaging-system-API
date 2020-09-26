const express = require("express");
const app = express();
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const cors = require('cors');
const pg = require('pg');

app.use(express.json());
app.use(cors());
app.use(bodyParser.json())

secret = "messagingSystem_Ilay";

// set connection to DB
// URI: postgres://pwnlaxzoyzpgsl:667679a03f45755931f0b2d6a869568c29edb64db442936469227c610675ad26@ec2-3-218-112-22.compute-1.amazonaws.com:5432/dbttjtetbj6nkg
var client = new pg.Client({
  user: "pwnlaxzoyzpgsl",
  password: "667679a03f45755931f0b2d6a869568c29edb64db442936469227c610675ad26",
  database: "dbttjtetbj6nkg",
  port: 5432,
  host: "ec2-3-218-112-22.compute-1.amazonaws.com",
  ssl: true
}); 
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;
client.connect( function (err, db) {console.log('Connect to DB')});

// PORT LISTENER
var port = 3000;
app.listen(port, function () {console.log('Example app listening on port ' + port);});


app.post('/register', async function (req, res) {
  // Check request params
  if (!(req.body.username && req.body.password)) {
    res.status(400).send("Request is missing fields: username, password. The registration did not happened");
    res.end();
    return;
  }
  try {
      const text = 'INSERT INTO Users(username, password) VALUES($1, $2) RETURNING *'
      const values = [req.body.username,req.body.password]
      client.query(text, values, function (err, result) {
          if (result) {
              res.status(200).send("User successfully registered!")
          } else {
              console.log(err)
              res.status(500).send(`Server error occured.`)
          }
      })
  } catch (e) {
      console.log(e);
      res.status(500).send(`Server error occured.`)
  }
});

app.post('/login', async function (req, res) {
  // Check request params
  if (!(req.body.username && req.body.password)) {
    res.status(400).send("Request is missing fields: username, password.");
    res.end();
    return;
  }
  try {
    const query = {
      name: 'fetch-user',
      text: 'SELECT * FROM users WHERE username = $1 AND password = $2',
      values: [req.body.username,req.body.password],
    }
    client.query(query, function (err, result) {
          if (result) {
              if (result.rows.length > 0) {
                  let payload = { username: req.body.username, _id: result.rows[0]._id};
                  let options = { expiresIn: "1d" };
                  const token = jwt.sign(payload, secret, options);
                  res.send({"token": token, "_id": result.rows[0]._id });
              } else {
                  res.status(404).send("No such user")
              }
          } else {
              console.log(err)
              res.status(500).send("Server error occured.");
          }
      })
  } catch (e) {
      console.log(e);
      res.status(500).send("Server error occured.")
  }
}
);

// Decode token and continue to other methods
app.use('/private', function (req, res, next) {
  const token = req.header("token");
  // no token
  if (!token) {
      res.status(401).send("Access denied. No token provided.");
  } else {
      // verify token
      try {
          const decoded = jwt.verify(token, secret);
          req.decoded = decoded;
      } catch (exception) {
          res.status(400).send("Invalid token.");
      }
      next();
  }
})


app.post("/private/createMessage", function(req, res) {
  // Check request params
  if (!(req.body.msg_subject && req.body.msg_body && req.body.receiver_username)) {
    res.status(400).send("Request is missing fields: subject, body and receiver are required. The message was not sent");
    res.end();
    return;
  }

  //get receiver _id
  try {
    const text = 'SELECT _id FROM users WHERE username = $1'
    const values = [req.body.receiver_username]
    client.query(text, values, function (err, result) {
        if (result) {
          if(result.rows.length > 0){
            // send the message
              try {
                const text = 'INSERT INTO messages(sender_id, receiver_id,msg_body,msg_subject,creation_date) VALUES($1, $2, $3, $4, $5) RETURNING *'
                const values = [req.decoded._id,result.rows[0]._id,req.body.msg_body,req.body.msg_subject,new Date()]
                client.query(text, values, function (err, result) {
                    if (result) {
                        res.status(200).send("Message sent successfully to user '"+req.body.receiver_username+"'!")
                    } else {
                        console.log(err)
                        res.status(500).send(`Server error occured.`)
                    }
                })
              } catch (e) {
                  console.log(e);
                  res.status(500).send(`Server error occured.`)
              }
          }
          else{
            res.status(404).send("No such user '"+req.body.receiver_username+"'. The message was not sent")
          }
        } else {
            console.log(err)
            res.status(500).send(`Server error occured.`)
        }
    })
} catch (e) {
    console.log(e);
    res.status(500).send(`Server error occured.`)
}

 
});

app.get("/private/getAllUserMessages", function(req, res) {
  try {
    const text = 'SELECT * FROM messages WHERE receiver_id = $1'
    const values = [req.decoded._id]
    client.query(text, values, function (err, result) {
        if (result) {
          res.send(result.rows);
        } else {
            console.log(err)
            res.status(500).send(`Server error occured.`)
        }
    })
} catch (e) {
    console.log(e);
    res.status(500).send(`Server error occured.`)
}
});

app.get("/private/getAllUserUnreadMessages", function(req, res) {
  try {
    const text = 'SELECT * FROM messages WHERE receiver_id = $1 AND msg_read_by_rec = false'
    const values = [req.decoded._id]
    client.query(text, values, function (err, result) {
        if (result) {
          res.send(result.rows);
        } else {
            console.log(err)
            res.status(500).send(`Server error occured.`)
        }
    })
} catch (e) {
    console.log(e);
    res.status(500).send(`Server error occured.`)
}
});

app.post("/private/readMessage", function(req, res) {
  // Check request params
  if (!(req.body.messageId) || isNaN(req.body.messageId)) {
    res.status(400).send("Request is missing/wrong fields: messageId.");
    res.end();
    return;
  }
  try {
    const text = 'UPDATE messages SET msg_read_by_rec = true WHERE receiver_id = $1 AND _id = $2 RETURNING *'
    const values = [req.decoded._id, req.body.messageId]
    client.query(text, values, function (err, result) {
        if (result) {
          if(result.rows < 1){
            res.status(404).send("The message with id '"+req.body.messageId+"' was not found in your inbox.")
          }
          else{
            res.send(result.rows[0]);
          }
        } else {
            console.log(err)
            res.status(500).send(`Server error occured.`)
        }
    })
} catch (e) {
    console.log(e);
    res.status(500).send(`Server error occured.`)
}
});


app.post("/private/deleteMessage", function(req, res) {
  // Check request params
  if (!(req.body.messageId) || isNaN(req.body.messageId)) {
    res.status(400).send("Request is missing/wrong fields: messageId.");
    res.end();
    return;
  }
  try {
    // delete message
      const text = 'DELETE FROM messages WHERE _id = $1 AND (sender_id = $2 OR receiver_id = $2) RETURNING *'
      const values = [req.body.messageId, req.decoded._id]
      client.query(text, values, function (err, result) {
          if (result) {
            if(result.rows < 1){
              res.status(401).send("The message with id '"+req.body.messageId+"' was not found/deleted. Deletion allowed Only as owner or as receiver")
            }
            else{
              res.status(200).send("Message deleted successfully!");
            }
          } else {
              console.log(err)
              res.status(500).send(`Server error occured.`)
          }
      })
} catch (e) {
    console.log(e);
    res.status(500).send(`Server error occured.`)
}
});
