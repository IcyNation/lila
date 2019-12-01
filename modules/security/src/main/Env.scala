package lila.security

import akka.actor._
import com.softwaremill.macwire._
import io.methvin.play.autoconfig._
import play.api.Configuration
import play.api.libs.ws.WSClient
import scala.concurrent.duration._

import lila.common.config._
import lila.common.{ Bus, Strings, Iso, EmailAddress }
import lila.memo.SettingStore.Strings._
import lila.oauth.OAuthServer
import lila.user.{ UserRepo, Authenticator }

final class Env(
    appConfig: Configuration,
    ws: WSClient,
    captcher: lila.hub.actors.Captcher,
    userRepo: UserRepo,
    authenticator: Authenticator,
    slack: lila.slack.SlackApi,
    asyncCache: lila.memo.AsyncCache.Builder,
    settingStore: lila.memo.SettingStore.Builder,
    tryOAuthServer: OAuthServer.Try,
    mongoCache: lila.memo.MongoCache.Builder,
    db: lila.db.Env,
    lifecycle: play.api.inject.ApplicationLifecycle
)(implicit system: ActorSystem, scheduler: Scheduler) {

  private val config = appConfig.get[SecurityConfig]("security")(SecurityConfig.loader)
  import config.net.baseUrl

  // val recaptchaPublicConfig = recaptcha.public

  lazy val firewall = new Firewall(
    coll = db(config.collection.firewall),
    scheduler = scheduler
  )

  lazy val flood = wire[Flood]

  lazy val recaptcha: Recaptcha =
    if (config.recaptchaC.enabled) wire[RecaptchaGoogle]
    else RecaptchaSkip

  lazy val forms = wire[DataForm]

  lazy val geoIP: GeoIP = wire[GeoIP]

  lazy val userSpyApi = wire[UserSpyApi]

  lazy val store = new Store(db(config.collection.security))

  lazy val ipIntel = {
    def mk = (email: EmailAddress) => wire[IpIntel]
    mk(config.ipIntelEmail)
  }

  lazy val ugcArmedSetting = settingStore[Boolean](
    "ugcArmed",
    default = true,
    text = "Enable the user garbage collector".some
  )

  lazy val printBan = new PrintBan(db(config.collection.printBan))

  lazy val garbageCollector = {
    def mk: (() => Boolean) => GarbageCollector = isArmed => wire[GarbageCollector]
    mk(ugcArmedSetting.get)
  }

  private lazy val mailgun: Mailgun = wire[Mailgun]

  lazy val emailConfirm: EmailConfirm =
    if (config.emailConfirm.enabled) new EmailConfirmMailgun(
      userRepo = userRepo,
      mailgun = mailgun,
      baseUrl = baseUrl,
      tokenerSecret = config.emailConfirm.secret
    )
    else wire[EmailConfirmSkip]

  lazy val passwordReset = {
    def mk = (s: Secret) => wire[PasswordReset]
    mk(config.passwordResetSecret)
  }

  lazy val magicLink = {
    def mk = (s: Secret) => wire[MagicLink]
    mk(config.passwordResetSecret)
  }

  lazy val emailChange = {
    def mk = (s: Secret) => wire[EmailChange]
    mk(config.emailChangeSecret)
  }

  lazy val loginToken = new LoginToken(config.loginTokenSecret, userRepo)

  lazy val automaticEmail = wire[AutomaticEmail]

  private lazy val dnsApi: DnsApi = wire[DnsApi]

  private lazy val checkMail: CheckMail = wire[CheckMail]

  lazy val emailAddressValidator = wire[EmailAddressValidator]

  private lazy val disposableEmailDomain = new DisposableEmailDomain(
    ws = ws,
    providerUrl = config.disposableEmail.providerUrl,
    checkMailBlocked = () => checkMail.fetchAllBlocked
  )

  // import reactivemongo.api.bson._

  lazy val spamKeywordsSetting = settingStore[Strings](
    "spamKeywords",
    default = Strings(Nil),
    text = "Spam keywords separated by a comma".some
  )

  lazy val spam = new Spam(spamKeywordsSetting.get)

  scheduler.scheduleOnce(30 seconds)(disposableEmailDomain.refresh)
  scheduler.scheduleWithFixedDelay(config.disposableEmail.refreshDelay, config.disposableEmail.refreshDelay) {
    () => disposableEmailDomain.refresh
  }

  lazy val tor: Tor = wire[Tor]
  scheduler.scheduleOnce(31 seconds)(tor.refresh(_ => funit))
  scheduler.scheduleWithFixedDelay(config.tor.refreshDelay, config.tor.refreshDelay) {
    () => tor.refresh(firewall.unblockIps)
  }

  lazy val ipTrust: IpTrust = wire[IpTrust]

  lazy val api = wire[SecurityApi]

  lazy val csrfRequestHandler = wire[CSRFRequestHandler]

  def cli = wire[Cli]

  Bus.subscribeFun("fishnet") {
    case lila.hub.actorApi.fishnet.NewKey(userId, key) =>
      automaticEmail.onFishnetKey(userId, key)(lila.i18n.defaultLang)
  }
}
