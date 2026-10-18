// Orologio di prova: il server crede che sia il 25 dicembre 2026 alle 10:00 (Roma)
const RealDate = Date;
const offset = new RealDate('2026-12-25T10:00:00+01:00').getTime() - RealDate.now();
class FakeDate extends RealDate {
    constructor(...args) {
        if (args.length === 0) super(RealDate.now() + offset);
        else super(...args);
    }
    static now() {
        return RealDate.now() + offset;
    }
}
global.Date = FakeDate;
