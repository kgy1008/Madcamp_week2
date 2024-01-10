const express = require('express');
const mysql = require('mysql2');
const dbconfig = require('./config/database.json');
const url = require('url');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { runInNewContext } = require('vm');

//database connection pool
const pool = mysql.createPool({
    connectionLimit: 10,
    host: dbconfig.host,
    user: dbconfig.user,
    password: dbconfig.password,
    database: dbconfig.database,
    debug: false
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

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
      if(!data || data.length == 0){
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

  app.post('/login', (req, res) => {
    const body = req.body;
    const id = body.id;
    const pw = body.pw;
  
    console.log(id, pw);
  
    pool.query('select nickname,image,id,classes from user where id=? and password=?', [id, pw], (err, data) => {
      console.log(data);
      if (!data || data.length == 0) { // 로그인 실패
        console.log('로그인 실패');
        res.status(200).json({"id": ""});
      } else {
        if (data[0].image != null) {
          res.status(200).json({
            "nickname": data[0].nickname,
            "image": data[0].image, // 이미지가 있을 경우 이미지 전송
            "id": data[0].id,
            "classes": data[0].classes
          });
        } else {
          // 이미지가 없는 경우
          res.status(200).json({
            "nickname": data[0].nickname,
            "image": "", // 이미지가 없으므로 빈 문자열 전송
            "id": data[0].id,
            "classes": data[0].classes
          });
        }
      }
    });
  });
  
  


app.post('/login/idcert', (req, res) => {  // id 중복 체크
  console.log('/login/idcert의 post 인식');
  const id = req.body.id;
  console.log(id);
  
  pool.query('SELECT * FROM user WHERE id=?', [id], (err, data) => {
    if (err) {
      console.error('Query Error: ', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    
    if (!data || data.length == 0) {
      console.log('중복 아이디 없음');
      res.status(200).json({ "isExist": false });
    } else {
      console.log('중복 아이디 있음');
      res.status(200).json({ "isExist": true });
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
  const userID = req.body.id; 

  pool.query('SELECT name FROM star WHERE user = ?', [userID], (err, data) => {
      if (err) {
          res.status(500).send(err);
      } else {
          res.status(200).json(data);
      }
  });
});

app.post('/getcomments', (req, res) => { // 댓글 목록
  const selectedPostID = req.body._id;  // post의 기본키

  const query = `
    SELECT comment._id, comment.writer, comment.context, comment.writer_nickname, user.image 
    FROM comment 
    INNER JOIN user 
    ON comment.writer = user.id 
    WHERE comment.title = ?
  `;

  pool.query(query, [selectedPostID], async (err, comments) => {
    if (err) {
      res.status(500).send(err);
    } else {
      try {
        for (const comment of comments) {
          // user.image가 NULL이 아닐 경우에만 인코딩을 진행합니다.
          if (!comment.image) {
            comment.image = "";
          }
        }
        res.status(200).json(comments);
      } catch (error) {
        console.error('File read error', error);
        res.status(500).send('Error processing images');
      }
    }
  });
});

app.post('/kakaologin', (req, res) => { //카카오 로그인
  const body = req.body; 
  const id = body.id;

  console.log(id);

  pool.query('SELECT id,nickname,image,classes from user WHERE id = ?', [id], (err, data) => {
    if (data.length != 0) {
      console.error(err);
        console.log('이미 존재하는 아이디입니다.');
        res.status(200).json(data[0]);
    } else {
      console.log('존재하지 않는 아이디입니다 -> 새로운 페이지 이동');
      res.status(200).json({"id":""});
    }
  });
});

async function encodeImageToBase64(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer' // 이미지 데이터를 arraybuffer 형태로 받습니다.
    });

    // Buffer 객체를 생성하고, 이를 Base64로 인코딩합니다.
    const base64 = Buffer.from(response.data, 'binary').toString('base64');

    return base64;
  } catch (error) {
    console.error('Error downloading or encoding image:', error);
    return null;
  }
}

app.post('/kakaoregister', async (req, res) => { //카카오 회원가입
  const userID = req.body.id; 
  const userProfile = req.body.profile;
  const userClass = req.body.classes;
  const userNickname = req.body.nickname;

  console.log(userID,userProfile,userClass,userNickname);

  try {
    const base64 = await encodeImageToBase64(userProfile); // Base64 인코딩을 기다립니다.

    pool.query('INSERT INTO user(id, image, classes, nickname) values(?,?,?,?)', [userID, base64, userClass, userNickname], (err, data) => {
        if (err) {
            res.status(500).json({"message": false});
        } else {
            res.status(200).json({"message": true});
        }
    });
  } catch (error) {
    res.status(500).send('Internal Server Error');
  }
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
  const author = req.body.id;
  console.log(author);

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

app.post('/changepassword', (req, res) => { //비밀번호 변경
  const userID = req.body.id;
  const oldpw = req.body.oldpw;
  const newpw = req.body.newpw;

  pool.query('UPDATE user SET password = ? WHERE id = ? AND password = ?', [newpw, userID, oldpw], (err, data) => {
    if (err) {
      console.log('실패');
      console.error(err);
      res.status(500).json({ "message": false });
    } else {
      console.log('비밀번호 변경 성공');
      res.status(200).json({ "message": true });
    }
  });
});

app.post('/changeprofile', upload.single('file'), (req, res) => {
  const userID = req.body.id;
  const file = req.file;

  if (!file) {
    return res.status(400).send('No file uploaded');
  }

  const filePath = `uploads/${file.filename}`;
  console.log(userID, filePath);

  fs.readFile(filePath, { encoding: 'base64' }, (err, imageBase64) => {
    if (err) {
      console.error('Error reading file', err);
      return res.status(500).send('Error processing file');
    }

    pool.query('UPDATE user SET image = ? WHERE id = ?', [imageBase64, userID], (err, data) => {
      if (err) {
        console.error('Database error', err);
        res.status(500).send('Database error');
      } else {
        res.status(200).json({ "image": imageBase64 });
      }
    });
  });
});

app.post('/signout', (req, res) => { //회원탈퇴
  const userID = req.body.id;

  pool.query('DELETE FROM user WHERE id = ?', [userID], (err, data) => {
    if (err) {
      console.log('실패');
      console.error(err);
      res.status(500).json({ "message": false });
    } else {
      console.log('회원탈퇴 성공');
      res.status(200).json({ "message": true });
    }
  }
  );
});

app.post('/myboard', (req, res) => { //내가 만든 게시글
  const author = req.body.id; 

  pool.query('SELECT _id,author,title,context,author_nickname FROM posts WHERE author = ?', [author], (err, data) => {
      if (err) {
          res.status(500).send(err);
      } else {
          res.status(200).json(data);
      }
  });
});

app.post('/mycomment', (req, res) => { // 댓글 목록
  const writer = req.body.id;  // 작성자ID

  const query = `
    SELECT comment._id, comment.writer, comment.context, comment.writer_nickname, user.image 
    FROM comment 
    INNER JOIN user 
    ON comment.writer = user.id 
    WHERE comment.writer = ?
  `;

  pool.query(query, [writer], (err, results) => {
   if (err){
    res.status(500).send(err);
   }
   else{
    res.status(200).json(results);
   }
  });
});

app.post('/editnickname', (req, res) => { //닉네임 변경
  const userID = req.body.id;
  const newNickname = req.body.nickname;

  pool.query('UPDATE user SET nickname = ? WHERE id = ?', [newNickname, userID], (err, data) => {
    if (err) {
      console.log('실패');
      console.error(err);
      res.status(500).json({ "message": false });
    } else {
      console.log('닉네임 변경 성공');
      res.status(200).json({ "message": true });
    }
  });
});



//여기서부터 수정 코드

app.post('/getauthorimage', (req, res) => { //작성자 프로필 이미지 불러오기
  const authorID = req.body.id; // 작성자 ID
  const userID = req.body.user_id; // 사용자 ID
  const postID = req.body.post_id; // 게시글 ID

  const query = `
  SELECT user.image 
  FROM user
  INNER JOIN posts 
  ON posts.author = user.id 
  WHERE posts.author= ?
  `;
  pool.query(query, [authorID], (err, results) => {
    if (err){
      res.status(500).send(err);
    }
    else{
      // 추천 여부 확인 쿼리
      const recommendQuery = `
      SELECT post 
      FROM recommend 
      WHERE user = ?
      `;
      pool.query(recommendQuery, [userID], (err, recommendResults) => {
        if (err) {
          res.status(500).send(err);
        } else {
          const postIDNumber = parseInt(postID, 10);
          // postID가 추천 목록에 있는지 확인
          const isRecommended = recommendResults.some(recommend => parseInt(recommend.post, 10) === postIDNumber);
          const responseData = {
            ...results[0],
            isRecommended: isRecommended // 추천 목록에 있으면 true, 없으면 false
          };
          res.status(200).json(responseData);
        }
      });
    }
  });
});




app.post('/getrecommend', (req, res) => { //추천수 개수 보내주기
  const postID = req.body.id; // 게시글 ID

  const query = `
    SELECT count(*) as recommendcount
    FROM recommend 
    INNER JOIN posts 
    ON recommend.post = posts._id 
    WHERE recommend.post = ?
  `;

  pool.query(query, [postID], (err, results) => {
    if (err){
     res.status(500).send(err);
    }
    else{
     res.status(200).json(results[0]);
    }
   });

});

app.post('/recommendpost', (req, res) => { // 추천 추가 및 삭제
  const good = req.body.good; // 추천 눌렀는지 여부 -> true: 누름, false: 취소
  const postID = req.body.post_id; // 게시글 ID
  const userID = req.body.user_id; // 사용자 ID

  if (good) { // 추천 수 증가
    pool.query('INSERT INTO recommend (post, user) VALUES (?, ?)', [postID, userID], (err, data) => {
      if (err) {
        console.error('추천 추가 실패:', err);
        res.status(500).json({ "message": "Error adding to favorites" });
      } else {
        console.log('추천 추가 성공');
        res.status(200).json({ "message": true });
      }
    });
  } else { // 즐겨찾기 삭제
    pool.query('DELETE FROM recommend WHERE user = ? AND post = ?', [userID, postID], (err, data) => {
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

app.post('/rankingpost', (req, res) => { //추천수 순으로 게시글 목록
  const query = `
  SELECT p.*
  FROM posts p
  INNER JOIN (
      SELECT post, COUNT(*) as count
      FROM recommend
      GROUP BY post
      ORDER BY count DESC
      LIMIT 5
  ) as top_posts ON p._id = top_posts.post;`

  pool.query(query, (err, results) => {
    if (err){
      res.status(500).send(err);
    }
    else{
      res.status(200).json(results);
    }
  });
});


// 네이버 검색 API 예제 - 블로그 검색
var client_id = 'E';
var client_secret = '4';

app.post('/search/blog', function (req, res) {
  const query = req.body.query; // 쿼리 매개변수 사용
  console.log(query);
  var api_url = 'https://openapi.naver.com/v1/search/blog?display=15&query=' + encodeURI(query); // JSON 결과

  var request = require('request');
  var options = {
      url: api_url,
      headers: {'X-Naver-Client-Id':client_id, 'X-Naver-Client-Secret': client_secret}
  };

  request.get(options, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var responseBody = JSON.parse(body); // 응답 바디를 JSON 객체로 파싱
      var items = responseBody.items; // 'items' 필드 추출

      res.writeHead(200, {'Content-Type': 'text/json;charset=utf-8'});
      res.end(JSON.stringify(items)); // 'items'만을 JSON 형태로 응답
    } else {
      res.status(response.statusCode).end();
      console.error('Error:', error); // 보다 상세한 오류 로깅
    }
  });
});


app.listen(4000, () => {
    console.log('server is running');
});