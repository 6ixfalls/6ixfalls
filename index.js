const core = require("@actions/core");
const fs = require("fs");
const { spawn } = require("child_process");
const { Toolkit } = require("actions-toolkit");
const axios = require("axios").default;
const yaml = require("js-yaml");

// Get config
const GH_USERNAME = core.getInput("GH_USERNAME");
const COMMIT_MSG = core.getInput("COMMIT_MSG");
/**
 * Returns the sentence case representation
 * @param {String} str - the string
 *
 * @returns {String}
 */

const capitalize = (str) => str.slice(0, 1).toUpperCase() + str.slice(1);

const urlPrefix = "https://github.com";

/**
 * Returns a URL in markdown format for PR's and issues
 * @param {Object | String} item - holds information concerning the issue/PR
 *
 * @returns {String}
 */

const toUrlFormat = (item) => {
  if (typeof item === "object") {
    return Object.hasOwnProperty.call(item.payload, "issue")
      ? `[#${item.payload.issue.number}](${urlPrefix}/${item.repo.name}/issues/${item.payload.issue.number})`
      : `[#${item.payload.pull_request.number}](${urlPrefix}/${item.repo.name}/pull/${item.payload.pull_request.number})`;
  }
  return `[${item}](${urlPrefix}/${item})`;
};

/**
 * Execute shell command
 * @param {String} cmd - root command
 * @param {String[]} args - args to be passed along with
 *
 * @returns {Promise<void>}
 */

const exec = (cmd, args = []) =>
  new Promise((resolve, reject) => {
    const app = spawn(cmd, args, { stdio: "pipe" });
    let stdout = "";
    app.stdout.on("data", (data) => {
      stdout = data;
    });
    app.on("close", (code) => {
      if (code !== 0 && !stdout.includes("nothing to commit")) {
        err = new Error(`Invalid status code: ${code}`);
        err.code = code;
        return reject(err);
      }
      return resolve(code);
    });
    app.on("error", reject);
  });

/**
 * Make a commit
 *
 * @returns {Promise<void>}
 */

const commitFile = async () => {
  await exec("git", [
    "config",
    "--global",
    "user.email",
    "41898282+github-actions[bot]@users.noreply.github.com",
  ]);
  await exec("git", ["config", "--global", "user.name", "readme-bot"]);
  await exec("git", ["add", "README.md"]);
  await exec("git", ["commit", "-m", COMMIT_MSG]);
  await exec("git", ["push"]);
};

Toolkit.run(
  async (tools) => {
    // Get the user's public repositories
    tools.log.debug(`Getting activity for ${GH_USERNAME}`);
    const publicRepos = await tools.github.repos.listForUser({
      username: GH_USERNAME,
      per_page: 100,
    });
    tools.log.debug(
      `Repositories for ${GH_USERNAME}, ${publicRepos.data.length} repos found.`
    );

    tools.log.debug("Getting list of GitHub supported languages");
    const languagesReq = await axios.get(
      "https://raw.githubusercontent.com/github/linguist/master/lib/linguist/languages.yml"
    );
    const languages = yaml.load(languagesReq.data);

    let highestLength = 1;
    const content = publicRepos.data
      // Filter out forks
      .filter((repo) => repo.fork == false)
      // Call the serializer to construct a string
      .map((repo) => {
        let updated = new Date(repo.updated_at);
        highestLength = Math.max(highestLength, repo.size.toString().length);
        return [
          repo.size.toString(),
          `-rw-r--r-- 1 sixfalls $size ${updated.toLocaleString("en-US", {
            month: "short",
          })} ${updated
            .getDay()
            .toString()
            .padStart(2, "0")} ${updated.toLocaleTimeString("en-US", {
              hour12: false,
              hour: "2-digit",
              minute: "2-digit",
            })} <a href="${repo.html_url}">${repo.name.toLowerCase() +
            (repo.language ? languages[repo.language].extensions[0] : ".txt")
          }</a>`,
        ];
      });

    const readmeContent = fs.readFileSync("./README.md", "utf-8").split("\n");

    // Find the index corresponding to <!--START_SECTION:projects--> comment
    let startIdx = readmeContent.findIndex(
      (content) => content.trim() === "<!--START_SECTION:projects-->"
    );

    // Early return in case the <!--START_SECTION:projects--> comment was not found
    if (startIdx === -1) {
      return tools.exit.failure(
        `Couldn't find the <!--START_SECTION:projects--> comment. Exiting!`
      );
    }

    // Find the index corresponding to <!--END_SECTION:projects--> comment
    const endIdx = readmeContent.findIndex(
      (content) => content.trim() === "<!--END_SECTION:projects-->"
    );

    if (!content.length) {
      tools.exit.failure("No Repositories found");
    }

    if (content.length < 5) {
      tools.log.info("Found less than 5 repositories");
    }

    if (startIdx !== -1 && endIdx === -1) {
      startIdx++;
      readmeContent.splice(startIdx + content.length, 0, "<pre>");
      startIdx++;
      readmeContent.splice(startIdx + content.length, 0, "~ root# ls -o work/");
      startIdx++;
      readmeContent.splice(
        startIdx + content.length,
        0,
        `total ${content.length}`
      );
      // Add one since the content needs to be inserted just after the initial comment
      startIdx++;
      content.forEach((line, idx) =>
        readmeContent.splice(
          startIdx + idx,
          0,
          line[1].replace(/\$size/g, line[0].padStart(highestLength, " "))
        )
      );

      // Append <!--END_SECTION:projects--> comment
      readmeContent.splice(startIdx + content.length, 0, "</pre>");
      readmeContent.splice(
        startIdx + content.length + 1,
        0,
        "<!--END_SECTION:projects-->"
      );

      // Update README
      fs.writeFileSync("./README.md", readmeContent.join("\n"));

      // Commit to the remote repository
      try {
        await commitFile();
      } catch (err) {
        tools.log.debug("Something went wrong");
        return tools.exit.failure(err);
      }
      tools.exit.success("Wrote to README");
    }

    const oldContent = readmeContent.slice(startIdx + 1, endIdx).join("\n");
    const newContent = content
      .map((line, idx) =>
        line[1].replace(/\$size/g, line[0].padStart(highestLength, " "))
      )
      .join("\n");

    if (oldContent.trim() === newContent.trim())
      tools.exit.success("No changes detected");

    startIdx += 2;

    // Recent GitHub Activity content between the comments
    const readmeActivitySection = readmeContent.slice(startIdx, endIdx);
    if (!readmeActivitySection.length) {
      content.some((line, idx) => {
        // User doesn't have 5 public events
        if (!line) {
          return true;
        }
        readmeContent.splice(
          startIdx + idx,
          0,
          line[1].replace(/\$size/g, line[0].padStart(highestLength, " "))
        );
      });
      tools.log.success("Wrote to README");
    } else {
      // It is likely that a newline is inserted after the <!--START_SECTION:activity--> comment (code formatter)
      let count = 0;

      readmeActivitySection.some((line, idx) => {
        // User doesn't have 5 public events
        if (!content[count]) {
          return true;
        }
        if (line !== "") {
          readmeContent[startIdx + idx] = content[count][1].replace(
            /\$size/g,
            content[count][0].padStart(highestLength, " ")
          );
          count++;
        }
      });
      tools.log.success("Updated README with GitHub Repositories");
    }

    // Update README
    fs.writeFileSync("./README.md", readmeContent.join("\n"));

    // Commit to the remote repository
    try {
      await commitFile();
    } catch (err) {
      tools.log.debug("Something went wrong");
      return tools.exit.failure(err);
    }
    tools.exit.success("Pushed to remote repository");
  },
  {
    event: ["schedule", "workflow_dispatch"],
    secrets: ["GITHUB_TOKEN"],
  }
);
