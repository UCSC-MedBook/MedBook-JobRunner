# MedBook-JobRunner
## Runs and monitors Jobs (Current UNIX processes, Galaxy and other Environments coming)
### steps to adding a new tools

1. create a feature branch in git
2. look at https://github.com/UCSC-MedBook/MedBook-JobRunner/blob/f-gsea-new/webapp/server/classes/RunLimmaGSEA.js
3. create a new class
4. Add new class and its args to primary-collections repo collections/Jobs.js
4. add adapters (importers and exporters) to convert from MedBook objects to files that tools understand and store check them into external-tools
4. add external code to external-tools repo (or mechanism to install it)
5. add pointers to external code in your personal settings.json for use while testing
  - also add these pointers in the MedBook main repo docker-compose.yml METEOR_SETTINGS environment variable
6. add gui to appropriate MedBook app, that initiates job by inserting into jobs collection
  for example: 
   Jobs.insert({
      name: "UpDownGenes",
      status: "waiting",
      user_id: user._id,
      collaborations: [ user.personalCollaboration() ],
      args
    });
7. read errors from jobs.error_description
