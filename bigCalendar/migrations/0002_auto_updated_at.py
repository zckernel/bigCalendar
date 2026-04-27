from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('bigCalendar', '0001_initial'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE calendar_event
                MODIFY COLUMN updated_at DATETIME(6) NOT NULL
                DEFAULT CURRENT_TIMESTAMP(6)
                ON UPDATE CURRENT_TIMESTAMP(6);
            """,
            reverse_sql="""
                ALTER TABLE calendar_event
                MODIFY COLUMN updated_at DATETIME(6) NOT NULL;
            """,
        ),
    ]
