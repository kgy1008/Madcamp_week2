const express = require('express');
const mysql = require('mysql2');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const static = require('serve-static');
const bodyParser = require('body-parser');
const dbconfig = require('./config/database.json');
const jwt = require('jsonwebtoken');

//database connection pool
const pool = mysql.createPool({
    connectionLimit: 10,
    host: dbconfig.host,
    user: dbconfig.user,
    password: dbconfig.password,
    database: dbconfig.database,
    debug: false
});

const app = express();
app.use(express.urlencoded({extended: true}));
app.use(express.json());

app.post('/register', (req, res) =>{
    console.log('post 인식');
    const body = req.body;
    const id = body.id;
    const pw = body.password;
    const classes = body.classes;
    console.log(id,pw,classes);
  
    pool.query('select * from user where id=?',[id],(err,data)=>{
      if(data.length == 0){
          console.log('회원가입 성공');
          pool.query('INSERT INTO user(id, password, classes, nickname) values(?,?,?,?)',[id,pw,classes,id],(err,data)=>{
          
          res.status(200).json(
            {
              "message" : true
            }
          );
          });
      }else{
          console.log('회원가입 실패');
          res.status(200).json(
            {
              "message" : false
            }
          );
          
      }
      
    });
  });

app.post('/login', (req, res)=>{ //로그인
  const body = req.body;
  const id = body.id;
  const pw = body.pw;
  
  pool.query('select nickname,image from user where id=? and password=?', [id,pw], (err, data)=>{
    if(data.length == 0){ // 로그인 실패
      console.log('로그인 실패');
      res.status(200).json({"nickname" : data[0].nickname, "image": data[0].image});
    }
    else{
      // 로그인 성공
      console.log('로그인 성공');
      pool.query('select nickname,image,id from user where id=?',[id],(err,data)=>{
        res.status(200).json({"nickname" : data[0].nickname, "image": data[0].image, "id": data[0].id});
      });
      
    }
  });

});


app.post('/login/idcert', (req, res) =>{  // id 중복 체크
  console.log('/login/idcert의 post 인식');
  const body = req.body;
  const id = body.id;

  pool.query('select * from user where id=?',[id],(err,data)=>{
    if(data.length == 0){
        console.log('중복 아이디 없음');
        res.status(200).json(
          {
            "isExist" : false
          }
        );
    }else{
        console.log('중복 아이디 있음');
        res.status(200).json(
          {
            "isExist" : true
          }
        );
    }
  });
});

//게시판 목록
app.post('/boardclass', (req, res) => {
  const userID = req.body.user_id;
  pool.query('SELECT name FROM star WHERE user = ?', [userID], (err, starData) => {
    if (err) {
        res.status(500).send(err);
    } else {
        pool.query('SELECT * FROM board', (err, boardData) => {
            if (err) {
                res.status(500).send(err);
            } else {
                const starNames = starData.map(data => data.name);
                const boardDataWithStar = boardData.map(data => {
                    return {...data, pinned: starNames.includes(data.name)};
                });
                res.status(200).json(boardDataWithStar);
            }
        });
    }
  });
});


app.post('/boardclass/create', (req, res) => { //게시판 생성
  const newBoardName = req.body.newtitle;
  const creator = req.body.creater;

  // 이미 존재하는 게시판인지를 확인하는 SELECT 쿼리를 사용하지 않고, 바로 삽입 쿼리를 실행합니다.
  pool.query('INSERT INTO board (name, creater) VALUES (?, ?)', [newBoardName, creator], (err, data) => {
    if (err) {
      // 오류 발생 시, 이미 존재하는 게시판인지 확인합니다.
      console.error(err);
      if (err.code === 'ER_DUP_ENTRY') {
        console.log('이미 존재하는 게시판입니다.');
        res.status(200).json({"success": false});
      } else {
        console.log('게시판 생성 실패');
        res.status(500).json({"success":false});
      }
    } else {
      console.log('게시판 생성 성공');
      res.status(200).json({"success": true});
    }
  });
});


// 게시글 목록
app.post('/board', (req, res) => {
  const selectedBoard = req.body.name; 

  pool.query('SELECT _id,author,title,context,author_nickname FROM posts WHERE board = ?', [selectedBoard], (err, data) => {
      if (err) {
          res.status(500).send(err);
      } else {
          res.status(200).json(data);
      }
  });
});

app.post('/checkedboardclass', (req, res) => { // 즐겨찾기 게시판
  const selectedBoardID = req.body.id; 

  pool.query('SELECT user,name FROM star WHERE user = ?', [selectedBoardID], (err, data) => {
      if (err) {
          res.status(500).send(err);
      } else {
          res.status(200).json(data);
      }
  });
});

app.post('/getcomments', (req, res) => { //댓글 가져오기
  const selectedPostID = req.body._id; 

  pool.query('SELECT _id,writer,context,writer_nickname FROM comment WHERE title = ?', [selectedPostID], (err, data) => {
      if (err) {
          res.status(500).send(err);
      } else {
          res.status(200).json(data);
      }
  });
});

app.post('/kakaologin', (req, res) => { //카카오 로그인
  const body = req.body; 
  const id = body.id;

  pool.query('SELECT id from user WHERE id = ?', [id], (err, data) => {
    if (data.length != 0) {
      console.error(err);
        console.log('이미 존재하는 아이디입니다.');
        res.status(200).json({"message": true});
    } else {
      console.log('존재하지 않는 아이디입니다 -> 새로운 페이지 이동');
      res.status(200).json({"success": false});
    }
  });

});

app.post('/kakaoregister', (req, res) => { //카카오 회원가입
  const userID = req.body.id; 
  const userProfile = req.body.profile;
  const userClass = req.body.classes;
  const userNickname = req.body.nickname;
  console.log(userID,userProfile,userClass,userNickname);
  pool.query('INSERT INTO user(id, image, classes, nickname) values(?,?,?,?)', [userID,userProfile,userClass,userNickname], (err, data) => {
      if (err) {
          res.status(500).json({"message": false});
      } else {
          res.status(200).json({"message": true});
      }
  });
});

app.post('/createboard', (req, res) => { //게시글 생성
  const author = req.body.author; 
  const postTitle = req.body.title;
  const postContext = req.body.context;
  const boardClass = req.body.boardclass;
  const authorNickname = req.body.author_nickname;

  console.log(author,postTitle,postContext,boardClass,authorNickname);

  pool.query('INSERT INTO posts(author, title, context, board, author_nickname) values(?,?,?,?,?)', [author,postTitle,postContext,boardClass,authorNickname], (err, data) => {
      if (err) {
          res.status(500).json({"message": false});       
      } else {
          res.status(200).json({"message": true});
      }
  });
});

app.post('/createcomment', (req, res) => { //댓글 작성
  const boardID = req.body._id;
  const commentWriter = req.body.writer;
  const commentContext = req.body.context;
  const commentNickname = req.body.writer_nickname;

  console.log(boardID,commentWriter,commentContext,commentNickname);

  pool.query('INSERT INTO comment (writer, context, title, writer_nickname) VALUES (?, ?, ?, ?)', [commentWriter,commentContext, boardID,commentNickname], (err, data) => {
    if (err) {
      console.log('실패');
      console.error(err);
    } else {
      console.log('댓글 작성 성공');
      res.status(200).json({"message": true });
    }
  });

});

app.post('/deletecomment', (req, res) => { //댓글 삭제
  const commentID = req.body._id;

  console.log(commentID);

  pool.query('DELETE FROM comment WHERE _id = ?', [commentID], (err, data) => {
    if (err) {
      console.log('실패');
      console.error(err);
    } else {
      console.log('댓글 삭제 성공');
      res.status(200).json({"message": true });
    }
  });

});

app.post('/updatecomment', (req, res) => { //댓글 수정
  const commentID = req.body._id;
  const commenttext = req.body.context;

  console.log(commentID,commenttext);

  pool.query('UPDATE comment SET context = ? WHERE _id = ?', [commenttext,commentID], (err, data) => {
    if (err) {
      console.log('실패');
      console.error(err);
    } else {
      console.log('댓글 수정 성공');
      res.status(200).json({"message": true });
    }
  }
  );
});

app.post('/updatepost', (req, res) => { //게시글 수정
  const postID = req.body._id;
  const postTitle = req.body.title;
  const posttext = req.body.context;

  console.log(postID,postTitle,posttext);

  pool.query('UPDATE posts SET context = ?, title = ? WHERE _id = ?', [posttext, postTitle, postID], (err, data) => {
    if (err) {
      console.log('게시글 수정 실패');
      console.error(err);
      res.status(500).json({ "message": false });
    } else {
      console.log('게시글 수정 성공');
      res.status(200).json({ "message": true });
    }
  });
});


app.post('/deletepost', (req, res) => { //게시글 삭제
  const postID = req.body._id;

  console.log(postID);

  pool.query('DELETE FROM posts WHERE _id = ?', [postID], (err, data) => {
    if (err) {
      console.log('실패');
      console.error(err);
    } else {
      console.log('게시글 삭제 성공');
      res.status(200).json({"message": true });
    }
  }
  );
});

app.post('/myboardclass',(req,res)=>{ //내가 만든 게시판
  const author = req.body.user_id;

  pool.query('SELECT name FROM board WHERE creater = ?', [author], (err, data) => {
    if (err) {
        res.status(500).send(err);
    } else {
        res.status(200).json(data);
    }
  });
});

app.post('/deleteboardclass', (req, res) => { //게시판 삭제
  const boardName = req.body.name;

  console.log(boardName);

  pool.query('DELETE FROM board WHERE name = ?', [boardName], (err, data) => {
    if (err) {
      console.log('실패');
      console.error(err);
    } else {
      console.log('게시판 삭제 성공');
      res.status(200).json({"message": true });
    }
  });
});

app.post('/pinboardclass', (req, res) => { // 즐겨찾기 게시판 추가 및 삭제
  const pin = req.body.pinned;
  const userID = req.body.user_id;
  const boardName = req.body.boardclass;

  if (pin) { // 즐겨찾기 추가
    pool.query('INSERT INTO star (user, name) VALUES (?, ?)', [userID, boardName], (err, data) => {
      if (err) {
        console.error('즐겨찾기 추가 실패:', err);
        res.status(500).json({ "message": "Error adding to favorites" });
      } else {
        console.log('즐겨찾기 추가 성공');
        res.status(200).json({ "message": true });
      }
    });
  } else { // 즐겨찾기 삭제
    pool.query('DELETE FROM star WHERE user = ? AND name = ?', [userID, boardName], (err, data) => {
      if (err) {
        console.error('즐겨찾기 삭제 실패:', err);
        res.status(500).json({ "message": "Error removing from favorites" });
      } else {
        console.log('즐겨찾기 삭제 성공');
        res.status(200).json({ "message": true });
      }
    });
  }
});


app.listen(4000, () => {
    console.log('server is running');
});