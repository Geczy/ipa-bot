![Demo](https://github.com/dotabod/backend/assets/1036968/7bd6663a-577a-417c-ad74-d037fab641d3)

# IPA Bot

This is a Telegram bot for downloading and decrypting iOS app files (.ipa). It uses the `bagbak` tool and the `ipatool` binary to decrypt the encrypted .ipa files.

## Prerequisites

To run this bot, make sure you have the following software installed:

- Node.js (version >= 19.0.0, < 20.0.0)
- Yarn package manager
- Jailbroken iPhone on iOS 16
  - [OpenSSH](https://www.ios-repo-updates.com/repository/cydia-telesphoreo/package/openssh/) with root login access
  - [Frida](https://www.ios-repo-updates.com/repository/frida/package/re.frida.server/) run `frida-server -D` on the device
  - [AppSync Unified](https://www.ios-repo-updates.com/repository/karen-s-repo/package/ai.akemi.appsyncunified/)

## Installation

1. Clone this repository:

   ```shell
   git clone https://github.com/geczy/ipa-bot.git
   ```

2. Navigate to the project directory:

   ```shell
   cd ipa-bot
   ```

3. Install the dependencies:

   ```shell
   yarn install
   ```

4. Rename the `.env.example` file to `.env`:

   ```shell
   mv .env.example .env
   ```

5. Open the `.env` file and provide the necessary values for the environment variables.

## Usage

To start the bot, run the following command:

```shell
yarn start
```

The bot will connect to Telegram and start listening for commands.

## Available Commands

The following commands are available for interacting with the IPA Bot:

- `/request <App Store URL>`: Downloads and decrypts the iOS app specified by the provided App Store URL. The decrypted app file will be uploaded to the chat.
- `/reboot`: Restarts the bot. This command is only available to administrators specified in the `ADMIN_IDS` environment variable.
- `/delete <App Store URL>`: Deletes the app information and files associated with the provided App Store URL from the database and file system. This command is only available to administrators specified in the `ADMIN_IDS` environment variable.

Please make sure to provide valid App Store URLs when using the `/request` and `/delete` commands.

Note: The bot can only process one app download or deletion request at a time. If there is already an ongoing request, additional requests will be added to a queue and processed in order once the previous request is completed.

## License

This project is licensed under the GNU Affero General Public License v3.0. See the [LICENSE](LICENSE) file for details.

## Credits

This project uses the following dependencies:

- [ipatool](https://github.com/majd/ipatool/) - A tool for working with iOS app packages (.ipa).
- [bagbak](https://github.com/ChiChou/bagbak) - A tool for decrypting encrypted iOS app packages (.ipa).

## Contributing

Contributions are welcome! If you have any suggestions, bug reports, or feature requests, please create an issue or submit a pull request.
