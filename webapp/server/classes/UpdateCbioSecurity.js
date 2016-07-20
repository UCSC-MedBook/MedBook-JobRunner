function UpdateCbioSecurity (job_id) {
  Job.call(this, job_id);
}
UpdateCbioSecurity.prototype = Object.create(Job.prototype);
UpdateCbioSecurity.prototype.constructor = UpdateCbioSecurity;

UpdateCbioSecurity.prototype.run = function () {
  if (Meteor.isServer) {
    var mysql   = Npm.require("mysql");
    var connection = mysql.createConnection({
      host     : 'localhost',
      user     : 'root',
      password : 'baer1sch',
      database : 'cbioportal'
    });

    connection.connect();
    connection.query('DELETE FROM USERS',  function (err, result){
      if (err) {
        console.log('error deleting from users', err);
      }
    })
    connection.query('DELETE FROM AUTHORITIES',  function (err, result){
      if (err) {
        console.log('error deleting from AUTHORITIES', err);
      }
    })
    for (var i in this.job.args.collaborationList) {
      var collab = this.job.args.collaborationList[i]
      var cobj = Collaborations.findOne({name:collab})
      var members = cobj.getAssociatedCollaborators()
      for (var j in members) {
        var member = members[j]
        var newUser = { name: member, email: member, enabled:1 };
        //var newUserId = cbioUsers.insert(newUser);
        connection.query('INSERT INTO USERS SET ?', newUser, function (err, result){
          if (err) {
            console.log('error inserting into cbioportal.Users', err)
          }
        })
        var newAuth = { email: member, authority: 'cbbioportal:'+collab };
        //var newUserId = cbioAuthorities.insert(newAuth);
        connection.query('INSERT INTO AUTHORITIES SET ?', newAuth, function (err, result){
          if (err) {
            console.log('error inserting into cbioportal.Authorities', err)
          }
        })
      }
    };
  connection.end();
  }
}
JobClasses.UpdateCbioSecurity = UpdateCbioSecurity;
